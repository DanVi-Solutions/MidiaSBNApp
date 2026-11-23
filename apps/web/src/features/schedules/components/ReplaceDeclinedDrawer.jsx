"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePrivateWorkspace } from "@/components/layout/PrivateWorkspaceContext";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  CalendarXIcon,
  CheckIcon,
  CloseIcon,
  ChurchIcon,
  SwapIcon,
} from "@/components/ui/icons";
import {
  getAvailableCredentials,
  replaceDeclinedAssignment,
} from "@/features/schedules/services/schedulesService";
import {
  clearRightDrawerAttrs,
  closeAnimatedRightDrawer,
  openRightDrawer,
  setupRightDrawerOutsideCollapse,
  shouldIgnoreRightDrawerClose,
} from "@/lib/rightDrawer";
import { computeInitials } from "@/lib/roles";
import { worshipServiceLabel } from "@/lib/worshipServices";
import styles from "./MonthlyScheduleView.module.css";

const isUnavailable = (candidate) => !candidate.available;

const attentionReasons = (candidate) => [
  ...(isUnavailable(candidate)
    ? [
        candidate.isUnavailable
          ? "registrou ausência neste horário"
          : "não marcou disponibilidade neste dia e período",
      ]
    : []),
  ...(candidate.worshipConflict
    ? [
        `vai deixar de ir ao próprio culto (domingo, ${worshipServiceLabel(candidate.worshipService)})`,
      ]
    : []),
];

export function ReplaceDeclinedDrawer({ event, person, onClose }) {
  const { notifySchedulesChanged } = usePrivateWorkspace();
  const toast = useToast();

  const titleId = useId();
  const warningTitleId = useId();
  const dialogRef = useRef(null);
  const warningDialogRef = useRef(null);
  const closeBtnRef = useRef(null);
  const isCleaningUpRef = useRef(false);

  const [candidates, setCandidates] = useState(null);
  const [chosenId, setChosenId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    isCleaningUpRef.current = false;
    openRightDrawer(dialog);
    const rafId = window.requestAnimationFrame(() => {
      closeBtnRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      isCleaningUpRef.current = true;
      clearRightDrawerAttrs(dialog);
      dialog.removeAttribute("data-closing");
      if (dialog.open) dialog.close();
    };
  }, []);

  useEffect(() => {
    return setupRightDrawerOutsideCollapse(dialogRef.current, {
      canCollapse: () => !isSaving,
    });
  }, [isSaving]);

  useEffect(() => {
    let active = true;
    getAvailableCredentials(event.id).then((res) => {
      if (!active) return;
      if (!res.ok || !Array.isArray(res.data)) {
        setCandidates([]);
        setFormError(res.error || "Não foi possível carregar as pessoas.");
        return;
      }
      setCandidates(res.data);
    });
    return () => {
      active = false;
    };
  }, [event.id]);

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

  const closeDrawer = () => closeAnimatedRightDrawer(dialogRef.current);
  const chosen = candidates?.find(
    (candidate) => candidate.credential.id === chosenId
  );
  const chosenReasons = chosen ? attentionReasons(chosen) : [];

  const replace = async () => {
    if (!chosen || isSaving) return;
    setIsSaving(true);
    setFormError("");
    const res = await replaceDeclinedAssignment(
      event.id,
      person.memberId,
      chosen.credential.id
    );
    setIsSaving(false);

    if (!res.ok) {
      setFormError(res.error || "Não foi possível fazer a substituição.");
      return;
    }

    notifySchedulesChanged();
    await closeAnimatedRightDrawer(dialogRef.current);
    toast.success(
      `${chosen.credential.name} assumiu o lugar de ${person.name}.`
    );
  };

  const handleSubmit = () => {
    if (!chosen) return;
    if (chosenReasons.length > 0) {
      warningDialogRef.current?.showModal();
      return;
    }
    replace();
  };

  return (
    <dialog
      ref={dialogRef}
      data-side-drawer="right"
      aria-labelledby={titleId}
      className={styles.scheduleDrawer}
      onCancel={(cancelEvent) => {
        if (cancelEvent.cancelable) {
          cancelEvent.preventDefault();
          if (!isSaving) closeDrawer();
        }
      }}
      onClose={handleDialogClose}
    >
      <div className={styles.scheduleDrawerHeader}>
        <div>
          <p className={styles.scheduleDrawerEyebrow}>SUBSTITUIÇÃO</p>
          <h2 id={titleId} className={styles.scheduleDrawerTitle}>
            Substituir {person.name}
          </h2>
        </div>

        <button
          ref={closeBtnRef}
          type="button"
          aria-label="Fechar substituição"
          disabled={isSaving}
          className={styles.drawerCloseButton}
          onClick={closeDrawer}
        >
          <CloseIcon />
        </button>
      </div>

      <div className={styles.scheduleDrawerForm}>
        <div className={styles.scheduleDrawerBody}>
          <p className={styles.replaceIntro}>
            <strong>{person.name}</strong> avisou que não vai participar de{" "}
            <strong>
              {event.title} ({event.fullDateLabel}, {event.time})
            </strong>
            . Escolha quem assume a vaga: a pessoa é avisada e precisa confirmar
            presença.
          </p>

          <fieldset className={styles.memberFieldset}>
            <legend className="visually-hidden">Nova pessoa</legend>
            {candidates === null ? (
              <p className={styles.recurringEmptyNote}>Carregando pessoas...</p>
            ) : candidates.length === 0 ? (
              <p className={styles.recurringEmptyNote}>
                Não há outras pessoas do ministério para colocar nesta escala.
              </p>
            ) : (
              <div className={styles.memberSelectorGrid}>
                {candidates.map((candidate) => {
                  const isSelected = chosenId === candidate.credential.id;
                  return (
                    <label
                      key={candidate.credential.id}
                      className={`${styles.memberCard} ${
                        isSelected ? styles.memberCardSelected : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="replacement"
                        value={candidate.credential.id}
                        checked={isSelected}
                        className="visually-hidden"
                        onChange={() => setChosenId(candidate.credential.id)}
                      />
                      <span className={styles.memberCardAvatar} aria-hidden="true">
                        {computeInitials(candidate.credential.name)}
                      </span>
                      <span className={styles.memberCardText}>
                        <span className={styles.memberCardName}>
                          <span className={styles.memberCardNameText}>
                            {candidate.credential.name}
                          </span>
                          {isUnavailable(candidate) && (
                            <CalendarXIcon
                              className={styles.memberUnavailableIcon}
                            />
                          )}
                          {candidate.worshipConflict && (
                            <ChurchIcon
                              className={styles.memberWorshipIcon}
                            />
                          )}
                        </span>
                        <span className={styles.memberCardHandle}>
                          {candidate.credential.username
                            ? `@${candidate.credential.username}`
                            : "Primeiro acesso"}
                        </span>
                        <span
                          className={`${styles.memberAvailabilityTag} ${
                            candidate.available
                              ? styles.memberAvailabilityOk
                              : candidate.isUnavailable
                                ? styles.memberAvailabilityDanger
                                : styles.memberAvailabilityWarn
                          }`}
                        >
                          {candidate.available
                            ? "Disponível"
                            : candidate.isUnavailable
                              ? "Ausência no horário"
                              : "Sem disponibilidade"}
                        </span>
                        {candidate.worshipConflict && (
                          <span className={styles.memberWorshipTag}>
                            No horário do culto
                          </span>
                        )}
                      </span>
                      {isSelected && (
                        <span className={styles.memberCardCheck} aria-hidden="true">
                          <CheckIcon />
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          {formError && (
            <div className={styles.formBannerError} role="alert">
              <AlertCircleIcon className={styles.fieldErrorIcon} />
              <span>{formError}</span>
            </div>
          )}
        </div>

        <div className={styles.scheduleDrawerFooter}>
          <button
            type="button"
            disabled={isSaving}
            className={styles.drawerCancelButton}
            onClick={closeDrawer}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={isSaving || !chosen}
            aria-busy={isSaving}
            className={styles.drawerSubmitButton}
            onClick={handleSubmit}
          >
            <SwapIcon />
            <span>{isSaving ? "Substituindo..." : "Colocar no lugar"}</span>
          </button>
        </div>
      </div>

      <dialog
        ref={warningDialogRef}
        aria-labelledby={warningTitleId}
        className={styles.modalDialog}
      >
        <div className={styles.modalForm}>
          <h2 id={warningTitleId} className={styles.modalTitle}>
            Confirmar substituição?
          </h2>
          <p className={styles.modalSubtitle}>
            Vale conversar com a pessoa antes de colocá-la na escala.
          </p>
          {chosen && (
            <ul className={styles.unavailablePickList}>
              <li className={styles.unavailablePickItem}>
                {isUnavailable(chosen) ? (
                  <CalendarXIcon className={styles.memberUnavailableIcon} />
                ) : (
                  <ChurchIcon className={styles.memberWorshipIcon} />
                )}
                <span>
                  <strong>{chosen.credential.name}</strong>{" "}
                  {chosenReasons.join(" e ")}
                </span>
              </li>
            </ul>
          )}
          <div className={styles.modalActions}>
            <button
              type="button"
              autoFocus
              className={styles.modalCancelButton}
              onClick={() => warningDialogRef.current?.close()}
            >
              Escolher outra pessoa
            </button>
            <button
              type="button"
              className={styles.modalConfirmButton}
              onClick={() => {
                warningDialogRef.current?.close();
                replace();
              }}
            >
              Colocar mesmo assim
            </button>
          </div>
        </div>
      </dialog>
    </dialog>
  );
}
