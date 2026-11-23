"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePrivateWorkspace } from "@/components/layout/PrivateWorkspaceContext";
import { useToast } from "@/components/ui/ToastProvider";
import { CheckIcon, CloseIcon, SwapIcon } from "@/components/ui/icons";
import {
  acceptChangeRequest,
  rejectChangeRequest,
} from "@/features/schedules/services/schedulesService";
import {
  APP_TIME_ZONE,
  extractDateAndTimeInZone,
  formatScheduleDateDisplay,
} from "@/features/schedules/utils/scheduleDates";
import {
  clearRightDrawerAttrs,
  closeAnimatedRightDrawer,
  openRightDrawer,
  setupRightDrawerOutsideCollapse,
  shouldIgnoreRightDrawerClose,
} from "@/lib/rightDrawer";
import styles from "./MonthlyScheduleView.module.css";

export function SubstitutionDrawer({ request, onClose }) {
  const { notifySchedulesChanged } = usePrivateWorkspace();
  const toast = useToast();

  const titleId = useId();
  const dialogRef = useRef(null);
  const closeBtnRef = useRef(null);
  const isCleaningUpRef = useRef(false);

  const [isDeciding, setIsDeciding] = useState(false);

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
      if (dialog.open) {
        dialog.close();
      }
    };
  }, []);

  useEffect(() => {
    return setupRightDrawerOutsideCollapse(dialogRef.current, {
      canCollapse: () => !isDeciding,
    });
  }, [isDeciding]);

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

  const handleDecision = async (decision) => {
    if (isDeciding || !request) return;
    setIsDeciding(true);

    const res =
      decision === "accepted"
        ? await acceptChangeRequest(request.id)
        : await rejectChangeRequest(request.id);

    setIsDeciding(false);

    if (!res.ok) {
      toast.error(
        res.error || "Não foi possível processar a resposta da troca."
      );
      return;
    }

    notifySchedulesChanged();
    await closeAnimatedRightDrawer(dialogRef.current);

    const schedTitle = request.schedule?.name || "escala";
    toast.success(
      decision === "accepted"
        ? `Substituição aceita para "${schedTitle}".`
        : `Solicitação recusada. A liderança seguirá com "${schedTitle}".`
    );
  };

  return (
    <dialog
      ref={dialogRef}
      data-side-drawer="right"
      aria-labelledby={titleId}
      className={styles.substitutionDrawer}
      onCancel={(event) => {
        if (event.cancelable) {
          event.preventDefault();
          if (!isDeciding) {
            closeAnimatedRightDrawer(dialogRef.current);
          }
        }
      }}
      onClose={handleDialogClose}
    >
      <div className={styles.drawerHeader}>
        <div className={styles.drawerHeaderLead}>
          <span className={styles.substitutionIconWrap} aria-hidden="true">
            <SwapIcon />
          </span>
          <div>
            <p className={styles.drawerEyebrow}>AÇÃO NECESSÁRIA</p>
            <h2 id={titleId} className={styles.drawerTitle}>
              Pedido de substituição
            </h2>
          </div>
        </div>

        <button
          ref={closeBtnRef}
          type="button"
          aria-label="Fechar detalhes da substituição"
          autoFocus
          disabled={isDeciding}
          className={styles.drawerCloseButton}
          onClick={() => closeAnimatedRightDrawer(dialogRef.current)}
        >
          <CloseIcon />
        </button>
      </div>

      <div className={styles.drawerBody}>
        {request && (
          <>
            <div className={styles.drawerSummaryCard}>
              <h3 className={styles.drawerSummaryTitle}>
                Você foi sugerido para uma substituição
              </h3>
              <p className={styles.drawerSummaryDesc}>
                <strong>
                  {request.credential?.name}
                  {request.credential?.username
                    ? ` (@${request.credential.username})`
                    : ""}
                </strong>{" "}
                não poderá participar e indicou você para assumir esta escala.
              </p>
            </div>

            <dl className={styles.drawerMetaList}>
              <div className={styles.drawerMetaItem}>
                <dt>MINISTÉRIO</dt>
                <dd>{request.schedule?.department?.name}</dd>
              </div>
              <div className={styles.drawerMetaItem}>
                <dt>EVENTO</dt>
                <dd>{request.schedule?.name}</dd>
              </div>
              <div className={styles.drawerMetaItem}>
                <dt>DATA E HORÁRIO</dt>
                <dd>
                  {(() => {
                    const { dateIso, time } = extractDateAndTimeInZone(
                      request.schedule?.scheduleAt,
                      APP_TIME_ZONE
                    );
                    const info = formatScheduleDateDisplay(dateIso);
                    return `${info.fullDateLabel} • ${time}`;
                  })()}
                </dd>
              </div>
            </dl>
          </>
        )}
      </div>

      <div className={styles.drawerFooter}>
        <button
          type="button"
          disabled={isDeciding}
          className={styles.declineButton}
          onClick={() => handleDecision("declined")}
        >
          <CloseIcon />
          <span>Recusar</span>
        </button>
        <button
          type="button"
          disabled={isDeciding}
          aria-busy={isDeciding}
          className={styles.acceptButton}
          onClick={() => handleDecision("accepted")}
        >
          <CheckIcon />
          <span>{isDeciding ? "Salvando..." : "Aceitar substituição"}</span>
        </button>
      </div>
    </dialog>
  );
}
