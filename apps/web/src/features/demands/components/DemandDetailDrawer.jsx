"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePrivateWorkspace } from "@/components/layout/PrivateWorkspaceContext";
import { useToast } from "@/components/ui/ToastProvider";
import {
  CalendarIcon,
  CheckCircleIcon,
  CheckIcon,
  CloseIcon,
  PencilIcon,
  RefreshCwIcon,
  TrashIcon,
} from "@/components/ui/icons";
import { updateDemand } from "@/features/demands/services/demandsService";
import {
  clearRightDrawerAttrs,
  closeAnimatedRightDrawer,
  openRightDrawer,
  setupRightDrawerOutsideCollapse,
  shouldIgnoreRightDrawerClose,
} from "@/lib/rightDrawer";
import {
  canDeleteDemand,
  canEditDemand,
  canToggleDemandStatus,
  computeInitials,
} from "@/lib/roles";
import styles from "./DemandsView.module.css";

function formatDatePtBr(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDateTimePtBr(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function DemandDetailDrawer({ demand = null, onRequestDelete, onClose }) {
  const { currentUser, notifyDemandsChanged, openWorkspaceDrawer } =
    usePrivateWorkspace();
  const toast = useToast();

  const drawerTitleId = useId();
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const isCleaningUpRef = useRef(false);

  const [currentDemand, setCurrentDemand] = useState(demand);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [nowMs, setNowMs] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setNowMs(Date.now());
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    isCleaningUpRef.current = false;
    openRightDrawer(dialog);
    const rafId = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
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
      canCollapse: () => !isUpdatingStatus,
    });
  }, [isUpdatingStatus]);

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

  if (!currentDemand) return null;

  const assignees = Array.isArray(currentDemand.assignees)
    ? currentDemand.assignees
    : [];
  const hasAssignees = assignees.length > 0;
  const isCompleted = currentDemand.status === "COMPLETED";
  const isOverdue =
    !isCompleted &&
    nowMs > 0 &&
    currentDemand.dueAt &&
    Date.parse(currentDemand.dueAt) < nowMs;
  const formattedDue = formatDatePtBr(currentDemand.dueAt);
  const formattedCreatedAt = formatDateTimePtBr(currentDemand.createdAt);
  const formattedCompletedAt = formatDateTimePtBr(currentDemand.completedAt);

  const canEdit = canEditDemand(currentUser, currentDemand);
  const canDelete = canDeleteDemand(currentUser, currentDemand);
  const canToggle = canToggleDemandStatus(currentUser, currentDemand);
  const showBlockedHint =
    !isCompleted &&
    !canToggle &&
    hasAssignees &&
    currentDemand.createdBy?.id === currentUser?.id;

  const handleOpenEdit = () => {
    if (!canEdit || isUpdatingStatus) return;
    openWorkspaceDrawer("demand-form", {
      mode: "edit",
      demand: currentDemand,
    });
  };

  const handleToggleStatus = async () => {
    if (!canToggle || isUpdatingStatus) return;
    const isCompleting = !isCompleted;

    if (isCompleting && !hasAssignees) {
      toast.error("Associe ao menos um responsável para finalizar esta demanda.");
      openWorkspaceDrawer("demand-form", {
        mode: "edit",
        demand: currentDemand,
      });
      return;
    }

    const nextStatus = isCompleting ? "COMPLETED" : "IN_PROGRESS";
    setIsUpdatingStatus(true);
    const result = await updateDemand(currentDemand.id, { status: nextStatus });
    setIsUpdatingStatus(false);

    if (!result.ok || !result.data) {
      toast.error(
        result.error || "Não foi possível atualizar o status da demanda."
      );
      return;
    }

    setCurrentDemand(result.data);
    notifyDemandsChanged();
    toast.success(
      nextStatus === "COMPLETED"
        ? `Demanda "${result.data.title}" finalizada.`
        : `Demanda "${result.data.title}" reaberta.`
    );
  };

  const handleRequestDelete = async () => {
    if (!canDelete || isUpdatingStatus) return;
    const target = currentDemand;
    await closeAnimatedRightDrawer(dialogRef.current);
    onRequestDelete?.(target);
  };

  return (
    <dialog
      ref={dialogRef}
      data-side-drawer="right"
      aria-labelledby={drawerTitleId}
      className={styles.drawerDialog}
      onCancel={(event) => {
        if (event.cancelable) {
          event.preventDefault();
          if (!isUpdatingStatus) {
            closeAnimatedRightDrawer(dialogRef.current);
          }
        }
      }}
      onClose={handleDialogClose}
    >
      <div className={styles.drawerHeader}>
        <div>
          <p className={styles.drawerEyebrow}>DETALHES DA DEMANDA</p>
          <h2 id={drawerTitleId} className={styles.drawerTitle}>
            {currentDemand.title}
          </h2>
        </div>

        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Fechar detalhes da demanda"
          className={styles.drawerCloseButton}
          disabled={isUpdatingStatus}
          onClick={() => closeAnimatedRightDrawer(dialogRef.current)}
        >
          <CloseIcon />
        </button>
      </div>

      <div className={styles.drawerBody}>
        <div className={styles.cardBadges}>
          <span
            className={`${styles.statusPill} ${
              isCompleted
                ? styles.statusPillCompleted
                : styles.statusPillInProgress
            }`}
          >
            <span className={styles.statusDot} aria-hidden="true" />
            {isCompleted ? "Finalizado" : "Em progresso"}
          </span>

          {currentDemand.department?.name && (
            <span className={styles.ministryPill}>
              {currentDemand.department.name}
            </span>
          )}
        </div>

        <section className={styles.detailSection}>
          <h3 className={styles.detailSectionLabel}>Descrição</h3>
          {currentDemand.description ? (
            <p className={styles.detailDescription}>
              {currentDemand.description}
            </p>
          ) : (
            <p className={styles.detailEmptyText}>Sem descrição cadastrada.</p>
          )}
        </section>

        <section className={styles.detailInfoCard}>
          <div className={styles.detailInfoRow}>
            <span className={styles.detailSectionLabel}>
              {assignees.length > 1 ? "Responsáveis" : "Responsável"}
            </span>
            {hasAssignees ? (
              <div className={styles.detailAssigneesList}>
                {assignees.map((person) => (
                  <div key={person.id} className={styles.assigneeRow}>
                    <span className={styles.assigneeAvatar} aria-hidden="true">
                      {computeInitials(person.name)}
                    </span>
                    <div className={styles.assigneeText}>
                      <span className={styles.assigneeName}>{person.name}</span>
                      {person.username && (
                        <span className={styles.assigneeHandle}>
                          @{person.username}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <span className={styles.unassignedTag}>
                Sem responsável associado
              </span>
            )}
          </div>

          <div className={styles.detailInfoRow}>
            <span className={styles.detailSectionLabel}>Prazo</span>
            {formattedDue ? (
              <span
                className={`${styles.dueBadge} ${
                  isOverdue ? styles.dueBadgeOverdue : ""
                }`}
              >
                <CalendarIcon className={styles.dueIcon} />
                <span>
                  {isOverdue ? "Atrasada · " : ""}
                  {formattedDue}
                </span>
              </span>
            ) : (
              <span className={styles.detailEmptyText}>Sem prazo definido</span>
            )}
          </div>

          {currentDemand.createdBy ? (
            <div className={styles.detailInfoRow}>
              <span className={styles.detailSectionLabel}>Criada por</span>
              <div className={styles.assigneeRow}>
                <span className={styles.assigneeAvatar} aria-hidden="true">
                  {computeInitials(currentDemand.createdBy.name)}
                </span>
                <div className={styles.assigneeText}>
                  <span className={styles.assigneeName}>
                    {currentDemand.createdBy.name}
                  </span>
                  <span className={styles.assigneeHandle}>
                    {currentDemand.createdBy.username
                      ? `@${currentDemand.createdBy.username}`
                      : ""}
                    {currentDemand.createdBy.username && formattedCreatedAt
                      ? " · "
                      : ""}
                    {formattedCreatedAt}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            formattedCreatedAt && (
              <div className={styles.detailInfoRow}>
                <span className={styles.detailSectionLabel}>Criada em</span>
                <span className={styles.detailValue}>{formattedCreatedAt}</span>
              </div>
            )
          )}

          {isCompleted && formattedCompletedAt && (
            <div className={styles.detailInfoRow}>
              <span className={styles.detailSectionLabel}>Finalizada em</span>
              <span className={styles.detailValue}>{formattedCompletedAt}</span>
            </div>
          )}
        </section>

        {showBlockedHint && (
          <p className={styles.fieldHint}>
            Apenas um dos responsáveis associados ou a liderança do ministério
            pode finalizar esta tarefa.
          </p>
        )}
      </div>

      {(canToggle || canEdit || canDelete) && (
        <div className={styles.detailFooter}>
          {canToggle && (
            <button
              type="button"
              disabled={isUpdatingStatus}
              aria-busy={isUpdatingStatus}
              className={
                isCompleted
                  ? styles.reopenBtn
                  : hasAssignees
                    ? styles.completeBtn
                    : styles.completeBtnNeedsAssignee
              }
              onClick={handleToggleStatus}
            >
              {isCompleted ? (
                <RefreshCwIcon />
              ) : hasAssignees ? (
                <CheckCircleIcon />
              ) : (
                <CheckIcon />
              )}
              <span>
                {isUpdatingStatus
                  ? "Atualizando..."
                  : isCompleted
                    ? "Reabrir demanda"
                    : hasAssignees
                      ? "Finalizar"
                      : "Associar e finalizar"}
              </span>
            </button>
          )}

          {(canEdit || canDelete) && (
            <div className={styles.detailSecondaryRow}>
              {canEdit && (
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  className={styles.detailSecondaryBtn}
                  onClick={handleOpenEdit}
                >
                  <PencilIcon />
                  <span>Editar</span>
                </button>
              )}
              {canDelete && (
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  className={styles.detailDangerBtn}
                  onClick={handleRequestDelete}
                >
                  <TrashIcon />
                  <span>Excluir</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
