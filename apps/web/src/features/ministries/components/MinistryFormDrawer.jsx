"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { usePrivateWorkspace } from "@/components/layout/PrivateWorkspaceContext";
import { useToast } from "@/components/ui/ToastProvider";
import { AlertCircleIcon, CloseIcon } from "@/components/ui/icons";
import {
  createDepartment,
  updateDepartment,
} from "@/features/ministries/services/departmentsService";
import {
  clearRightDrawerAttrs,
  closeAnimatedRightDrawer,
  openRightDrawer,
  setupRightDrawerOutsideCollapse,
  shouldIgnoreRightDrawerClose,
} from "@/lib/rightDrawer";
import styles from "./MinistriesView.module.css";

function validateMinistryName(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "Informe o nome do ministério.";
  if (trimmed.length < 2) {
    return "O nome do ministério deve ter pelo menos 2 caracteres.";
  }
  if (trimmed.length > 80) {
    return "O nome do ministério pode ter no máximo 80 caracteres.";
  }
  return "";
}

export function MinistryFormDrawer({ mode = "create", ministry = null, onClose }) {
  const { refreshDepartments, refreshParticipants } = usePrivateWorkspace();
  const toast = useToast();

  const isEditingMinistry = mode === "edit" && Boolean(ministry);

  const drawerTitleId = useId();
  const nameInputId = useId();
  const nameErrorId = useId();
  const descriptionInputId = useId();

  const dialogRef = useRef(null);
  const nameInputRef = useRef(null);
  const nameTouchedRef = useRef(false);
  const announceTimerRef = useRef(null);
  const isCleaningUpRef = useRef(false);

  const [ministryName, setMinistryName] = useState(() =>
    isEditingMinistry ? ministry.name || "" : ""
  );
  const [ministryDescription, setMinistryDescription] = useState(() =>
    isEditingMinistry ? ministry.description || "" : ""
  );
  const [nameError, setNameError] = useState("");
  const [createFormError, setCreateFormError] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    return () => {
      if (announceTimerRef.current !== null) {
        window.clearTimeout(announceTimerRef.current);
      }
    };
  }, []);

  const announce = useCallback((message) => {
    if (announceTimerRef.current !== null) {
      window.clearTimeout(announceTimerRef.current);
    }
    setAnnouncement("");
    if (!message) return;

    announceTimerRef.current = window.setTimeout(() => {
      setAnnouncement(message);
    }, 200);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    isCleaningUpRef.current = false;
    openRightDrawer(dialog);
    const rafId = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      isCleaningUpRef.current = true;
      clearRightDrawerAttrs(dialog);
      dialog.removeAttribute("data-closing");
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  useEffect(() => {
    return setupRightDrawerOutsideCollapse(dialogRef.current, {
      canCollapse: () => !isCreating,
    });
  }, [isCreating]);

  const handleDialogClose = () => {
    const dialog = dialogRef.current;
    if (
      !dialog ||
      isCleaningUpRef.current ||
      shouldIgnoreRightDrawerClose(dialog)
    ) {
      return;
    }
    dialog.returnValue = "";
    onClose?.();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isCreating) return;

    nameTouchedRef.current = true;
    const nextNameError = validateMinistryName(ministryName);
    setNameError(nextNameError);
    setCreateFormError("");

    if (nextNameError) {
      announce(nextNameError);
      nameInputRef.current?.focus();
      return;
    }

    const trimmedName = ministryName.trim();
    const trimmedDescription = ministryDescription.trim();

    if (isEditingMinistry && ministry) {
      const patch = {};
      if (trimmedName !== ministry.name) {
        patch.name = trimmedName;
      }
      if (trimmedDescription !== (ministry.description || "").trim()) {
        patch.description = trimmedDescription || null;
      }

      if (Object.keys(patch).length === 0) {
        await closeAnimatedRightDrawer(dialogRef.current);
        return;
      }

      setIsCreating(true);
      const result = await updateDepartment(ministry.id, patch);
      setIsCreating(false);

      if (!result.ok || !result.data) {
        if (result.status === 409) {
          const conflictMsg =
            result.error || "Já existe um ministério com esse nome.";
          setNameError(conflictMsg);
          announce(conflictMsg);
          nameInputRef.current?.focus();
        } else {
          setCreateFormError(
            result.error ||
              "Não foi possível atualizar o ministério. Tente novamente."
          );
        }
        return;
      }

      await Promise.all([refreshDepartments(), refreshParticipants()]);
      await closeAnimatedRightDrawer(dialogRef.current);
      toast.success(`Ministério "${result.data.name}" atualizado com sucesso.`);
      return;
    }

    setIsCreating(true);
    const result = await createDepartment({
      name: trimmedName,
      description: trimmedDescription,
    });
    setIsCreating(false);

    if (!result.ok || !result.data) {
      if (result.status === 409) {
        const conflictMsg =
          result.error || "Já existe um ministério com esse nome.";
        setNameError(conflictMsg);
        announce(conflictMsg);
        nameInputRef.current?.focus();
      } else {
        setCreateFormError(
          result.error || "Não foi possível criar o ministério. Tente novamente."
        );
      }
      return;
    }

    await refreshDepartments();
    await closeAnimatedRightDrawer(dialogRef.current);
    toast.success(`Ministério "${result.data.name}" criado com sucesso.`);
  };

  return (
    <dialog
      ref={dialogRef}
      data-side-drawer="right"
      aria-labelledby={drawerTitleId}
      className={styles.createDrawer}
      onCancel={(event) => {
        if (event.cancelable) {
          event.preventDefault();
          if (!isCreating) {
            closeAnimatedRightDrawer(dialogRef.current);
          }
        }
      }}
      onClose={handleDialogClose}
    >
      <div className="visually-hidden" aria-live="polite" role="status">
        {announcement}
      </div>

      <div className={styles.drawerHeader}>
        <div>
          <p className={styles.drawerEyebrow}>
            {isEditingMinistry ? "EDITAR MINISTÉRIO" : "ESTRUTURA"}
          </p>
          <h2 id={drawerTitleId} className={styles.drawerTitle}>
            {isEditingMinistry ? "Editar ministério" : "Novo ministério"}
          </h2>
        </div>

        <button
          type="button"
          aria-label="Fechar formulário"
          className={styles.drawerCloseButton}
          disabled={isCreating}
          onClick={() => closeAnimatedRightDrawer(dialogRef.current)}
        >
          <CloseIcon />
        </button>
      </div>

      <form
        className={styles.drawerForm}
        noValidate
        onSubmit={handleSubmit}
      >
        <div className={styles.drawerBody}>
          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <label htmlFor={nameInputId} className={styles.fieldLabel}>
                Nome
              </label>
              <span className={styles.requiredTag}>Obrigatório</span>
            </div>
            <input
              ref={nameInputRef}
              id={nameInputId}
              name="ministryName"
              type="text"
              value={ministryName}
              placeholder="Ex.: Iluminação"
              required
              minLength={2}
              maxLength={80}
              aria-invalid={nameError ? "true" : "false"}
              aria-describedby={nameError ? nameErrorId : undefined}
              className={`${styles.input} ${
                nameError ? styles.inputError : ""
              }`}
              onChange={(event) => {
                const nextValue = event.currentTarget.value;
                nameTouchedRef.current = true;
                setMinistryName(nextValue);
                setCreateFormError("");
                if (nameError && !validateMinistryName(nextValue)) {
                  setNameError("");
                }
              }}
              onBlur={() => {
                if (nameTouchedRef.current) {
                  setNameError(validateMinistryName(ministryName));
                }
              }}
            />
            {nameError && (
              <div id={nameErrorId} className={styles.errorMsg}>
                <AlertCircleIcon className={styles.errorIcon} />
                <span>{nameError}</span>
              </div>
            )}
          </div>

          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <label
                htmlFor={descriptionInputId}
                className={styles.fieldLabel}
              >
                Descrição
              </label>
              <span className={styles.optionalTag}>Opcional</span>
            </div>
            <textarea
              id={descriptionInputId}
              name="ministryDescription"
              rows={3}
              value={ministryDescription}
              maxLength={255}
              placeholder="Descreva a atuação desta equipe."
              className={styles.textarea}
              onChange={(event) =>
                setMinistryDescription(event.currentTarget.value)
              }
            />
          </div>

          <div className={styles.infoNote}>
            {isEditingMinistry ? (
              <>
                As alterações de nome e descrição serão aplicadas imediatamente
                para todos os membros deste ministério.
              </>
            ) : (
              <>
                Depois de criar o ministério, você poderá vincular usuários e
                definir o <strong>Líder Geral</strong> diretamente pelo cartão do
                ministério.
              </>
            )}
          </div>

          {createFormError && (
            <div className={styles.formBannerError} role="alert">
              <AlertCircleIcon className={styles.errorIcon} />
              <span>{createFormError}</span>
            </div>
          )}
        </div>

        <div className={styles.drawerFooter}>
          <button
            type="button"
            className={styles.drawerCancelButton}
            disabled={isCreating}
            onClick={() => closeAnimatedRightDrawer(dialogRef.current)}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className={styles.drawerSubmitButton}
            disabled={isCreating}
            aria-busy={isCreating}
          >
            {isCreating
              ? isEditingMinistry
                ? "Salvando..."
                : "Criando..."
              : isEditingMinistry
                ? "Salvar alterações"
                : "Criar ministério"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
