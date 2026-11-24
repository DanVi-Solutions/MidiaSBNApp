"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePrivateWorkspace } from "@/components/layout/PrivateShell";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CalendarIcon,
  ClockIcon,
  PencilIcon,
  PlusIcon,
  SwapIcon,
  TrashIcon,
  TrendingUpIcon,
} from "@/components/ui/icons";
import {
  deleteRecurringEvent,
  promoteRecurringEvent,
} from "@/features/recurring-events/services/recurringEventsService";
import {
  canCreateRecurringEvent,
  canManageRecurringEvent,
  canPromoteRecurringEvent,
  canSeeRecurringEvents,
} from "@/lib/roles";
import styles from "./RecurringEventsView.module.css";

function setupClosedByFallback(dialog, onDismiss) {
  if (!dialog || "closedBy" in HTMLDialogElement.prototype) {
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

export function RecurringEventsView() {
  const {
    currentUser,
    departments,
    recurringEvents,
    isLoadingRecurringEvents,
    recurringEventsError,
    refreshRecurringEvents,
    broadcastWorkspaceSync,
    openWorkspaceDrawer,
  } = usePrivateWorkspace();
  const toast = useToast();

  const canViewPage = canSeeRecurringEvents(currentUser);
  const canCreate = useMemo(
    () => canCreateRecurringEvent(currentUser, departments),
    [currentUser, departments]
  );

  const deleteModalTitleId = useId();
  const deleteModalDescId = useId();
  const promoteModalTitleId = useId();
  const promoteModalDescId = useId();

  const deleteDialogRef = useRef(null);
  const promoteDialogRef = useRef(null);
  const announceTimerRef = useRef(null);

  const [pendingDeleteEvent, setPendingDeleteEvent] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const [pendingPromoteEvent, setPendingPromoteEvent] = useState(null);
  const [promoteError, setPromoteError] = useState("");
  const [isPromoting, setIsPromoting] = useState(false);

  const [liveAnnouncement, setLiveAnnouncement] = useState("");

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
    setLiveAnnouncement("");
    if (!message) return;

    announceTimerRef.current = window.setTimeout(() => {
      setLiveAnnouncement(message);
    }, 200);
  }, []);

  useEffect(() => {
    return setupClosedByFallback(deleteDialogRef.current, () => {
      if (!isDeleting) {
        deleteDialogRef.current?.close("cancel");
      }
    });
  }, [isDeleting]);

  useEffect(() => {
    return setupClosedByFallback(promoteDialogRef.current, () => {
      if (!isPromoting) {
        promoteDialogRef.current?.close("cancel");
      }
    });
  }, [isPromoting]);

  const handleOpenCreateDialog = () => {
    if (!canCreate) return;
    openWorkspaceDrawer("recurring-event-form", { mode: "create" });
  };

  const handleOpenEditDialog = (item) => {
    if (!item || !canManageRecurringEvent(currentUser, item)) return;
    openWorkspaceDrawer("recurring-event-form", { mode: "edit", event: item });
  };

  const handleOpenDeleteDialog = (item) => {
    const dialog = deleteDialogRef.current;
    if (
      !dialog ||
      dialog.open ||
      !item ||
      !canManageRecurringEvent(currentUser, item)
    ) {
      return;
    }

    setPendingDeleteEvent(item);
    setDeleteError("");
    setIsDeleting(false);
    dialog.returnValue = "";
    dialog.showModal();
  };

  const handleDeleteDialogClose = () => {
    const dialog = deleteDialogRef.current;
    if (dialog) {
      dialog.returnValue = "";
    }
    setPendingDeleteEvent(null);
    setDeleteError("");
    setIsDeleting(false);
  };

  const handleDeleteConfirm = async (event) => {
    event.preventDefault();
    if (isDeleting || !pendingDeleteEvent) return;

    const targetId = pendingDeleteEvent.id;
    const targetName = pendingDeleteEvent.name;

    setDeleteError("");
    setIsDeleting(true);
    const result = await deleteRecurringEvent(targetId);
    setIsDeleting(false);

    if (!result.ok) {
      const msg =
        result.error ||
        "Não foi possível excluir o evento recorrente. Tente novamente.";
      setDeleteError(msg);
      announce(msg);
      return;
    }

    deleteDialogRef.current?.close("confirm");
    await refreshRecurringEvents({ silent: true });
    broadcastWorkspaceSync();
    toast.success(`Evento recorrente "${targetName}" excluído.`);
  };

  const handleOpenPromoteDialog = (item) => {
    const dialog = promoteDialogRef.current;
    if (
      !dialog ||
      dialog.open ||
      !item ||
      !canPromoteRecurringEvent(currentUser, item)
    ) {
      return;
    }

    setPendingPromoteEvent(item);
    setPromoteError("");
    setIsPromoting(false);
    dialog.returnValue = "";
    dialog.showModal();
  };

  const handlePromoteDialogClose = () => {
    const dialog = promoteDialogRef.current;
    if (dialog) {
      dialog.returnValue = "";
    }
    setPendingPromoteEvent(null);
    setPromoteError("");
    setIsPromoting(false);
  };

  const handlePromoteConfirm = async (event) => {
    event.preventDefault();
    if (isPromoting || !pendingPromoteEvent) return;

    const targetId = pendingPromoteEvent.id;
    const targetName = pendingPromoteEvent.name;

    setPromoteError("");
    setIsPromoting(true);
    const result = await promoteRecurringEvent(targetId);
    setIsPromoting(false);

    if (!result.ok) {
      const msg =
        result.error ||
        "Não foi possível promover o evento recorrente. Tente novamente.";
      setPromoteError(msg);
      announce(msg);
      return;
    }

    promoteDialogRef.current?.close("confirm");
    await refreshRecurringEvents({ silent: true });
    broadcastWorkspaceSync();
    toast.success(
      `Evento recorrente "${targetName}" promovido para todos os ministérios.`
    );
  };

  if (!canViewPage) {
    return (
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.headerLead}>
            <p className={styles.pageEyebrow}>PROGRAMAÇÃO FIXA</p>
            <h1 className={styles.pageTitle}>Eventos recorrentes</h1>
          </div>
        </header>

        <div className={styles.restrictedCard}>
          <p className={styles.restrictedTitle}>
            Os eventos recorrentes estão disponíveis apenas para responsáveis
            das escalas ou líderes.
          </p>
          <div className={styles.restrictedActions}>
            <Link href="/schedule" className={styles.restrictedPrimaryLink}>
              Voltar à escala
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLead}>
          <p className={styles.pageEyebrow}>PROGRAMAÇÃO FIXA</p>
          <h1 className={styles.pageTitle}>Eventos recorrentes</h1>
          <p className={styles.pageSubtitle}>
            {canCreate
              ? "Cadastre modelos semanais com um ou mais horários no mesmo dia e reutilize-os ao gerar escalas."
              : "Visualize os eventos recorrentes disponíveis para o seu ministério utilizá-los ao criar escalas."}
          </p>
        </div>

        {canCreate && (
          <button
            type="button"
            className={styles.createButton}
            onClick={handleOpenCreateDialog}
          >
            <PlusIcon />
            <span>Novo evento recorrente</span>
          </button>
        )}
      </header>

      <div className="visually-hidden" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

      {isLoadingRecurringEvents && recurringEvents.length === 0 ? (
        <div className={styles.emptyState} role="status">
          <p className={styles.emptyTitle}>Carregando eventos recorrentes...</p>
        </div>
      ) : recurringEventsError && recurringEvents.length === 0 ? (
        <div className={styles.restrictedCard} role="alert">
          <p className={styles.restrictedTitle}>{recurringEventsError}</p>
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => refreshRecurringEvents()}
          >
            Tentar novamente
          </button>
        </div>
      ) : recurringEvents.length === 0 ? (
        <section
          className={styles.emptyState}
          aria-label="Nenhum evento recorrente"
        >
          <span className={styles.emptyIconBadge} aria-hidden="true">
            <SwapIcon />
          </span>
          <h2 className={styles.emptyTitle}>
            {canCreate
              ? "Nenhum evento recorrente cadastrado ainda"
              : "Nenhum evento recorrente disponível no momento"}
          </h2>
          {canCreate ? (
            <p className={styles.emptyDesc}>
              Use o botão <strong>Novo evento recorrente</strong> acima para
              cadastrar cultos e reuniões semanais.
            </p>
          ) : (
            <p className={styles.emptyDesc}>
              Quando houver modelos globais ou do seu ministério cadastrados,
              eles aparecerão aqui para uso nas escalas.
            </p>
          )}
        </section>
      ) : (
        <section
          className={styles.grid}
          aria-label="Lista de eventos recorrentes"
        >
          {recurringEvents.map((item) => {
            const canEditOrDelete = canManageRecurringEvent(currentUser, item);
            const canPromote = canPromoteRecurringEvent(currentUser, item);
            const timesList =
              Array.isArray(item.times) && item.times.length > 0
                ? item.times
                : item.time
                  ? [item.time]
                  : [];

            return (
              <article key={item.id} className={styles.card}>
                <header className={styles.cardHeader}>
                  <div className={styles.cardTopRow}>
                    <div className={styles.cardTopLead}>
                      <span className={styles.repeatBadge} aria-hidden="true">
                        <SwapIcon />
                      </span>
                      <span
                        title={
                          item.isGeneral
                            ? "Disponível para todos os ministérios"
                            : item.ministryName
                        }
                        className={
                          item.isGeneral
                            ? styles.generalScopeBadge
                            : styles.ministryScopeBadge
                        }
                      >
                        {item.isGeneral ? "Evento geral" : item.ministryName}
                      </span>
                    </div>

                    {canEditOrDelete && (
                      <div className={styles.cardActions}>
                        <button
                          type="button"
                          aria-label={`Editar evento recorrente ${item.name}`}
                          title="Editar evento recorrente"
                          className={styles.cardIconAction}
                          onClick={() => handleOpenEditDialog(item)}
                        >
                          <PencilIcon />
                        </button>
                        <button
                          type="button"
                          aria-label={`Excluir evento recorrente ${item.name}`}
                          title="Excluir evento recorrente"
                          className={`${styles.cardIconAction} ${styles.cardIconActionDanger}`}
                          onClick={() => handleOpenDeleteDialog(item)}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    )}
                  </div>

                  <h2 className={styles.cardTitle}>{item.name}</h2>
                  {item.description && (
                    <p className={styles.cardDescription}>{item.description}</p>
                  )}
                </header>

                <footer className={styles.cardFooter}>
                  <div className={styles.cardFooterMetaRow}>
                    <div className={styles.metaBlock}>
                      <CalendarIcon className={styles.metaIcon} />
                      <div className={styles.metaText}>
                        <span className={styles.metaLabel}>
                          {item.repeatPrefix}
                        </span>
                        <strong className={styles.metaValue}>
                          {item.weekday}
                        </strong>
                      </div>
                    </div>

                    <div className={styles.metaBlock}>
                      <ClockIcon className={styles.metaIcon} />
                      <div className={styles.metaText}>
                        <span className={styles.metaLabel}>
                          {timesList.length > 1 ? "Horários" : "Horário"}
                        </span>
                        <ul
                          className={styles.timesChipList}
                          aria-label={`Horários de ${item.name}`}
                        >
                          {timesList.map((timeVal) => (
                            <li key={timeVal} className={styles.timeChip}>
                              {timeVal}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>

                  {canPromote && (
                    <div className={styles.promoteActionRow}>
                      <button
                        type="button"
                        className={styles.promoteButton}
                        onClick={() => handleOpenPromoteDialog(item)}
                      >
                        <TrendingUpIcon />
                        <span>Promover para todos</span>
                      </button>
                    </div>
                  )}
                </footer>
              </article>
            );
          })}
        </section>
      )}

      {/* Native Confirmation Modal (<dialog>): Excluir evento recorrente */}
      <dialog
        ref={deleteDialogRef}
        closedby="any"
        aria-labelledby={deleteModalTitleId}
        aria-describedby={deleteModalDescId}
        className={styles.modalDialog}
        onCancel={(event) => {
          if (isDeleting) {
            event.preventDefault();
          }
        }}
        onClose={handleDeleteDialogClose}
      >
        <form className={styles.modalForm} onSubmit={handleDeleteConfirm}>
          <div className={styles.deleteModalLead}>
            <span className={styles.deleteModalBadge} aria-hidden="true">
              <AlertTriangleIcon />
            </span>
            <div>
              <h2 id={deleteModalTitleId} className={styles.modalTitle}>
                Excluir evento recorrente?
              </h2>
              <p id={deleteModalDescId} className={styles.modalSubtitle}>
                O modelo{" "}
                <strong>
                  {pendingDeleteEvent ? pendingDeleteEvent.name : ""}
                </strong>{" "}
                será removido da programação fixa semanal. As escalas já geradas
                por ele continuarão existindo.
              </p>
            </div>
          </div>

          {deleteError && (
            <div className={styles.formBannerError} role="alert">
              <AlertCircleIcon className={styles.errorIcon} />
              <span>{deleteError}</span>
            </div>
          )}

          <div className={styles.modalActions}>
            <button
              type="button"
              autoFocus
              disabled={isDeleting}
              className={styles.modalCancelButton}
              onClick={() => deleteDialogRef.current?.close("cancel")}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isDeleting}
              aria-busy={isDeleting}
              className={styles.modalDangerButton}
            >
              {isDeleting ? "Excluindo..." : "Excluir evento"}
            </button>
          </div>
        </form>
      </dialog>

      {/* Native Confirmation Modal (<dialog>): Promover evento recorrente */}
      <dialog
        ref={promoteDialogRef}
        closedby="any"
        aria-labelledby={promoteModalTitleId}
        aria-describedby={promoteModalDescId}
        className={styles.modalDialog}
        onCancel={(event) => {
          if (isPromoting) {
            event.preventDefault();
          }
        }}
        onClose={handlePromoteDialogClose}
      >
        <form className={styles.modalForm} onSubmit={handlePromoteConfirm}>
          <div className={styles.deleteModalLead}>
            <span className={styles.promoteModalBadge} aria-hidden="true">
              <TrendingUpIcon />
            </span>
            <div>
              <h2 id={promoteModalTitleId} className={styles.modalTitle}>
                Promover evento para todos?
              </h2>
              <p id={promoteModalDescId} className={styles.modalSubtitle}>
                O modelo{" "}
                <strong>
                  {pendingPromoteEvent ? pendingPromoteEvent.name : ""}
                </strong>{" "}
                {pendingPromoteEvent?.ministryName
                  ? `(${pendingPromoteEvent.ministryName}) `
                  : ""}
                passará a ficar disponível para{" "}
                <strong>todos os ministérios</strong> ao criar escalas. Após a
                promoção, o Líder Geral que o criou não poderá mais editá-lo nem
                excluí-lo.
              </p>
            </div>
          </div>

          {promoteError && (
            <div className={styles.formBannerError} role="alert">
              <AlertCircleIcon className={styles.errorIcon} />
              <span>{promoteError}</span>
            </div>
          )}

          <div className={styles.modalActions}>
            <button
              type="button"
              autoFocus
              disabled={isPromoting}
              className={styles.modalCancelButton}
              onClick={() => promoteDialogRef.current?.close("cancel")}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isPromoting}
              aria-busy={isPromoting}
              className={styles.modalPrimaryButton}
            >
              {isPromoting ? "Promovendo..." : "Promover para todos"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
