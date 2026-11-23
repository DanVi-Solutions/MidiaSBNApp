"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  KeyIcon,
} from "@/components/ui/icons";
import { copyTextToClipboard, CREDENTIAL_STATUS } from "@/lib/roles";
import styles from "./CredentialCodeModal.module.css";

function setupClosedByFallback(dialog, allowBackdropDismiss, onDismiss) {
  if (!dialog || !allowBackdropDismiss || "closedBy" in HTMLDialogElement.prototype) {
    return undefined;
  }

  const isOutside = (event) => {
    const rect = dialog.getBoundingClientRect();
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  };

  let pressedOutside = false;
  const handlePointerDown = (event) => {
    pressedOutside = isOutside(event);
  };
  const handlePointerUp = (event) => {
    if (pressedOutside && isOutside(event)) {
      onDismiss();
    }
    pressedOutside = false;
  };

  dialog.addEventListener("pointerdown", handlePointerDown);
  dialog.addEventListener("pointerup", handlePointerUp);

  return () => {
    dialog.removeEventListener("pointerdown", handlePointerDown);
    dialog.removeEventListener("pointerup", handlePointerUp);
  };
}

function CredentialCodeModalContent({
  modalState,
  titleId,
  isHashedSelf,
  copyButtonRef,
  confirmCheckboxRef,
  cancelGuardNotice,
  onClearCancelGuard,
  onRequestDismiss,
}) {
  const toast = useToast();
  const confirmCheckboxId = useId();
  const confirmErrorId = useId();
  const guardNoticeId = useId();

  const copyTimerRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [confirmError, setConfirmError] = useState("");

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    const code = modalState?.credentialNumber;
    if (!code) return;

    const didCopy = await copyTextToClipboard(code);
    if (copyTimerRef.current !== null) {
      window.clearTimeout(copyTimerRef.current);
    }

    if (didCopy) {
      setCopied(true);
      copyTimerRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 2200);
      toast.success("Código copiado para a área de transferência.");
    } else {
      toast.error(
        `Não foi possível copiar automaticamente. Código: ${code}`
      );
    }
  };

  const handleFinish = () => {
    if (isHashedSelf && !confirmed) {
      setConfirmError(
        "Confirme que copiou ou anotou o novo código antes de fechar."
      );
      confirmCheckboxRef.current?.focus();
      return;
    }

    onRequestDismiss("done");
  };

  const statusLabel =
    modalState?.status === CREDENTIAL_STATUS.PENDING
      ? "Primeiro acesso"
      : modalState?.status === CREDENTIAL_STATUS.RECOVERING
        ? "Recuperação"
        : "Ativo";

  return (
    <>
      <div className={styles.modalHeader}>
        <div className={styles.headerText}>
          <p className={styles.eyebrow}>
            {isHashedSelf ? "CÓDIGO DEFINITIVO" : "CÓDIGO TEMPORÁRIO"}
          </p>
          <h2 id={titleId} className={styles.title}>
            {modalState?.title || "Código de credencial gerado"}
          </h2>
          {modalState?.subtitle && (
            <p className={styles.subtitle}>{modalState.subtitle}</p>
          )}
        </div>

        {!isHashedSelf && (
          <button
            type="button"
            aria-label="Fechar janela"
            className={styles.closeBtn}
            onClick={() => onRequestDismiss("cancel")}
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <div className={styles.modalBody}>
        {modalState?.personName && (
          <div className={styles.recipientRow}>
            <div>
              <span className={styles.recipientLabel}>Participante</span>
              <p className={styles.recipientName}>{modalState.personName}</p>
            </div>
            <span
              className={`${styles.statusBadge} ${
                isHashedSelf ? styles.statusBadgeActive : styles.statusBadgeTemp
              }`}
            >
              {statusLabel}
            </span>
          </div>
        )}

        <div className={styles.codeCard}>
          <div className={styles.codeCardTop}>
            <span className={styles.codeLabel}>
              <KeyIcon />
              <span>Código de acesso</span>
            </span>
            <button
              ref={copyButtonRef}
              type="button"
              className={`${styles.copyButton} ${
                copied ? styles.copyButtonSuccess : ""
              }`}
              onClick={handleCopy}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              <span>{copied ? "Copiado" : "Copiar código"}</span>
            </button>
          </div>
          <p className={styles.codeValue}>{modalState?.credentialNumber}</p>
        </div>

        {isHashedSelf && (
          <div className={`${styles.callout} ${styles.calloutWarning}`}>
            <span className={styles.calloutIcon} aria-hidden="true">
              <AlertTriangleIcon />
            </span>
            <p className={styles.calloutText}>
              Este código já foi salvo de forma criptografada e não poderá ser
              visualizado novamente — nem por administradores. Todos os outros
              dispositivos conectados foram encerrados.
            </p>
          </div>
        )}

        {isHashedSelf && (
          <div className={styles.confirmBox}>
            <div className={styles.checkboxRow}>
              <input
                ref={confirmCheckboxRef}
                id={confirmCheckboxId}
                type="checkbox"
                checked={confirmed}
                aria-invalid={confirmError ? "true" : "false"}
                aria-describedby={
                  [
                    confirmError ? confirmErrorId : "",
                    cancelGuardNotice ? guardNoticeId : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
                className={styles.checkbox}
                onChange={(event) => {
                  setConfirmed(event.currentTarget.checked);
                  if (event.currentTarget.checked) {
                    setConfirmError("");
                    onClearCancelGuard();
                  }
                }}
              />
              <label htmlFor={confirmCheckboxId} className={styles.checkboxLabel}>
                Confirmo que copiei ou anotei meu novo código de acesso.
              </label>
            </div>

            {confirmError && (
              <div id={confirmErrorId} className={styles.errorMsg}>
                <AlertCircleIcon className={styles.errorIcon} />
                <span>{confirmError}</span>
              </div>
            )}

            <p
              id={guardNoticeId}
              className={`${styles.guardNotice} ${
                cancelGuardNotice ? styles.guardNoticeVisible : ""
              }`}
              aria-live="polite"
            >
              {cancelGuardNotice ||
                "Confirme que anotou o código antes de fechar."}
            </p>
          </div>
        )}
      </div>

      <div className={styles.modalFooter}>
        <button
          type="button"
          className={styles.doneButton}
          onClick={handleFinish}
        >
          <CheckIcon />
          <span>Concluir</span>
        </button>
      </div>
    </>
  );
}

export function CredentialCodeModal({ modalState, onClose }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const copyButtonRef = useRef(null);
  const confirmCheckboxRef = useRef(null);
  const [cancelGuardNotice, setCancelGuardNotice] = useState("");

  const isOpen = Boolean(modalState?.credentialNumber);
  const isHashedSelf = modalState?.variant === "hashed-self";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
        window.requestAnimationFrame(() => {
          copyButtonRef.current?.focus();
        });
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen, modalState?.credentialNumber]);

  useEffect(() => {
    return setupClosedByFallback(dialogRef.current, !isHashedSelf, () => {
      dialogRef.current?.close("dismiss");
    });
  }, [isHashedSelf]);

  const handleCancel = (event) => {
    if (isHashedSelf) {
      event.preventDefault();
      setCancelGuardNotice(
        "Copie seu novo código criptografado e marque a confirmação antes de fechar."
      );
      confirmCheckboxRef.current?.focus();
    }
  };

  const handleClose = () => {
    const dialog = dialogRef.current;
    if (dialog) {
      dialog.returnValue = "";
    }
    setCancelGuardNotice("");
    onClose?.();
  };

  return (
    <dialog
      ref={dialogRef}
      closedby={isHashedSelf ? "none" : "any"}
      aria-labelledby={titleId}
      className={styles.dialog}
      onCancel={handleCancel}
      onClose={handleClose}
    >
      {isOpen && (
        <CredentialCodeModalContent
          key={modalState.credentialNumber}
          modalState={modalState}
          titleId={titleId}
          isHashedSelf={isHashedSelf}
          copyButtonRef={copyButtonRef}
          confirmCheckboxRef={confirmCheckboxRef}
          cancelGuardNotice={cancelGuardNotice}
          onClearCancelGuard={() => setCancelGuardNotice("")}
          onRequestDismiss={(reason) => dialogRef.current?.close(reason)}
        />
      )}
    </dialog>
  );
}
