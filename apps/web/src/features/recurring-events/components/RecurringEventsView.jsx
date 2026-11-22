"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePrivateWorkspace } from "@/components/layout/PrivateShell";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  CalendarIcon,
  ClockIcon,
  CloseIcon,
  PlusIcon,
  SwapIcon,
  TrashIcon,
} from "@/components/ui/icons";
import {
  MINISTRY_OPTIONS,
  WEEKDAY_OPTIONS,
} from "@/features/recurring-events/data/mockRecurringEventsData";
import styles from "./RecurringEventsView.module.css";

let supportsDisplayTransition;

function canTransitionDisplay() {
  if (supportsDisplayTransition !== undefined) {
    return supportsDisplayTransition;
  }
  if (
    typeof window === "undefined" ||
    !window.CSS?.supports?.("transition-behavior", "allow-discrete") ||
    !document.body
  ) {
    return false;
  }
  const probe = document.createElement("div");
  probe.style.cssText =
    "transition: display 1s allow-discrete !important; display: block;";
  document.body.appendChild(probe);
  window.getComputedStyle(probe).display;
  probe.style.display = "none";
  supportsDisplayTransition =
    window.getComputedStyle(probe).display === "block";
  probe.remove();
  return supportsDisplayTransition;
}

function supportsTopLayerExit() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.CSS?.supports?.("overlay", "auto")) &&
    canTransitionDisplay()
  );
}

function setupBackdropDismiss(dialog, onDismiss) {
  if (!dialog) return undefined;

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
    pressedOutside = event.target === dialog && isOutside(event);
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

function getRepeatPrefix(weekday) {
  const match = WEEKDAY_OPTIONS.find((item) => item.value === weekday);
  return match ? match.repeatPrefix : "Repete toda";
}

function normalizeTimeValue(rawTime) {
  const trimmed = String(rawTime ?? "").trim();
  const TemporalApi =
    typeof globalThis !== "undefined" ? globalThis.Temporal : undefined;

  if (TemporalApi?.PlainTime && trimmed) {
    try {
      return TemporalApi.PlainTime.from(trimmed).toString({
        smallestUnit: "minute",
      });
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

function setupBackdropDismissFallback(dialog) {
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
      dialog.close("cancel");
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
    activeMinistry,
    ministries,
    recurringEvents,
    addRecurringEvent,
    deleteRecurringEvent,
  } = usePrivateWorkspace();
  const toast = useToast();

  const availableMinistryOptions = useMemo(() => {
    const options = [...MINISTRY_OPTIONS];
    const seen = new Set(options);
    for (const item of ministries || []) {
      if (item?.name && !seen.has(item.name)) {
        options.push(item.name);
        seen.add(item.name);
      }
    }
    return options;
  }, [ministries]);

  const createModalTitleId = useId();
  const deleteModalTitleId = useId();
  const titleInputId = useId();
  const titleErrorId = useId();
  const ministrySelectId = useId();
  const weekdaySelectId = useId();
  const timeInputId = useId();
  const timeErrorId = useId();

  const createDialogRef = useRef(null);
  const deleteDialogRef = useRef(null);
  const titleInputRef = useRef(null);
  const timeInputRef = useRef(null);
  const idCounterRef = useRef(1);
  const announceTimerRef = useRef(null);

  const [pendingDeleteEvent, setPendingDeleteEvent] = useState(null);

  const [eventTitle, setEventTitle] = useState("");
  const [ministryName, setMinistryName] = useState(
    activeMinistry?.name || MINISTRY_OPTIONS[0]
  );
  const [weekday, setWeekday] = useState("Domingo");
  const [eventTime, setEventTime] = useState("18:00");

  const [titleError, setTitleError] = useState("");
  const [timeError, setTimeError] = useState("");
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  useEffect(() => {
    return () => {
      if (announceTimerRef.current !== null) {
        window.clearTimeout(announceTimerRef.current);
      }
    };
  }, []);

  const closeAnimatedDialog = useCallback(async (dialog) => {
    if (!dialog || !dialog.open) return;

    if (!supportsTopLayerExit()) {
      dialog.setAttribute("data-closing", "");
      const animations = dialog.getAnimations({ subtree: true });
      if (animations.length > 0) {
        await Promise.race([
          Promise.allSettled(animations.map((a) => a.finished)),
          new Promise((resolve) => window.setTimeout(resolve, 1000)),
        ]);
      }
      if (!dialog.hasAttribute("data-closing")) return;
      dialog.removeAttribute("data-closing");
    }

    if (dialog.open) {
      dialog.close();
    }
  }, []);

  useEffect(() => {
    const cleanCreate = setupBackdropDismiss(createDialogRef.current, () => {
      closeAnimatedDialog(createDialogRef.current);
    });
    const cleanDelete = setupBackdropDismissFallback(deleteDialogRef.current);

    return () => {
      if (cleanCreate) cleanCreate();
      if (cleanDelete) cleanDelete();
    };
  }, [closeAnimatedDialog]);

  const announce = (message) => {
    if (announceTimerRef.current !== null) {
      window.clearTimeout(announceTimerRef.current);
    }
    setLiveAnnouncement("");
    if (!message) return;

    announceTimerRef.current = window.setTimeout(() => {
      setLiveAnnouncement(message);
    }, 200);
  };

  const resetCreateForm = () => {
    setEventTitle("");
    setMinistryName(activeMinistry?.name || MINISTRY_OPTIONS[0]);
    setWeekday("Domingo");
    setEventTime("18:00");
    setTitleError("");
    setTimeError("");
  };

  const handleOpenCreateDialog = () => {
    const dialog = createDialogRef.current;
    if (!dialog || dialog.open) return;
    resetCreateForm();
    dialog.removeAttribute("data-closing");
    dialog.showModal();
    window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
  };

  const handleCreateDialogClose = () => {
    const dialog = createDialogRef.current;
    if (!dialog) return;
    dialog.returnValue = "";
    setTitleError("");
    setTimeError("");
  };

  const handleCreateSubmit = async (event) => {
    event.preventDefault();

    const trimmedTitle = eventTitle.trim();
    const formattedTime = normalizeTimeValue(eventTime);

    let nextTitleError = "";
    if (!trimmedTitle) {
      nextTitleError = "Informe o nome do evento recorrente.";
    } else if (trimmedTitle.length < 2) {
      nextTitleError = "O nome do evento deve ter pelo menos 2 caracteres.";
    }

    let nextTimeError = "";
    if (!formattedTime) {
      nextTimeError = "Informe o horário do evento.";
    }

    setTitleError(nextTitleError);
    setTimeError(nextTimeError);

    if (nextTitleError) {
      announce(nextTitleError);
      titleInputRef.current?.focus();
      return;
    }

    if (nextTimeError) {
      announce(nextTimeError);
      timeInputRef.current?.focus();
      return;
    }

    idCounterRef.current += 1;
    const newItem = {
      id: `rec-custom-${idCounterRef.current}`,
      ministryName,
      title: trimmedTitle,
      weekday,
      time: formattedTime,
    };

    addRecurringEvent(newItem);
    await closeAnimatedDialog(createDialogRef.current);

    toast.success(`Evento recorrente "${newItem.title}" cadastrado.`);
  };

  const handleOpenDeleteDialog = (item) => {
    const dialog = deleteDialogRef.current;
    if (!dialog || dialog.open) return;
    setPendingDeleteEvent(item);
    dialog.showModal();
  };

  const handleDeleteDialogClose = () => {
    const dialog = deleteDialogRef.current;
    if (!dialog) return;

    const action = dialog.returnValue;
    dialog.returnValue = "";

    if (action === "confirm" && pendingDeleteEvent) {
      deleteRecurringEvent(pendingDeleteEvent.id);
      toast.success(
        `Evento recorrente "${pendingDeleteEvent.title}" excluído.`
      );
    }

    setPendingDeleteEvent(null);
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLead}>
          <p className={styles.pageEyebrow}>PROGRAMAÇÃO FIXA</p>
          <h1 className={styles.pageTitle}>Eventos recorrentes</h1>
          <p className={styles.pageSubtitle}>
            Cadastre eventos que acontecem toda semana e reutilize-os ao criar
            as escalas do mês.
          </p>
        </div>

        <button
          type="button"
          className={styles.createButton}
          onClick={handleOpenCreateDialog}
        >
          <PlusIcon />
          <span>Novo evento recorrente</span>
        </button>
      </header>

      <div className="visually-hidden" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

      {recurringEvents.length === 0 ? (
        <section
          className={styles.emptyCard}
          aria-label="Nenhum evento recorrente"
        >
          <span className={styles.emptyBadge} aria-hidden="true">
            <SwapIcon />
          </span>
          <h2 className={styles.emptyTitle}>
            Nenhum evento recorrente cadastrado
          </h2>
          <p className={styles.emptyDesc}>
            Adicione cultos e reuniões semanais para agilizar a montagem das
            escalas.
          </p>
          <button
            type="button"
            className={styles.createButton}
            onClick={handleOpenCreateDialog}
          >
            <PlusIcon />
            <span>Novo evento recorrente</span>
          </button>
        </section>
      ) : (
        <section
          className={styles.grid}
          aria-label="Lista de eventos recorrentes"
        >
          {recurringEvents.map((item) => (
            <article key={item.id} className={styles.card}>
              <header className={styles.cardHeader}>
                <div className={styles.cardTopRow}>
                  <span className={styles.repeatBadge} aria-hidden="true">
                    <SwapIcon />
                  </span>

                  <button
                    type="button"
                    aria-label={`Excluir evento recorrente ${item.title}`}
                    className={styles.deleteButton}
                    onClick={() => handleOpenDeleteDialog(item)}
                  >
                    <TrashIcon />
                  </button>
                </div>

                <p className={styles.ministryKicker}>{item.ministryName}</p>
                <h2 className={styles.cardTitle}>{item.title}</h2>
              </header>

              <footer className={styles.cardFooter}>
                <div className={styles.metaBlock}>
                  <CalendarIcon className={styles.metaIcon} />
                  <div className={styles.metaText}>
                    <span className={styles.metaLabel}>
                      {getRepeatPrefix(item.weekday)}
                    </span>
                    <strong className={styles.metaValue}>{item.weekday}</strong>
                  </div>
                </div>

                <div className={styles.metaBlock}>
                  <ClockIcon className={styles.metaIcon} />
                  <div className={styles.metaText}>
                    <span className={styles.metaLabel}>Horário</span>
                    <strong className={styles.metaValue}>{item.time}</strong>
                  </div>
                </div>
              </footer>
            </article>
          ))}
        </section>
      )}

      {/* Right-Side Animated Drawer: Novo evento recorrente */}
      <dialog
        ref={createDialogRef}
        aria-labelledby={createModalTitleId}
        className={styles.createDrawer}
        onCancel={(event) => {
          if (event.cancelable) {
            event.preventDefault();
            closeAnimatedDialog(createDialogRef.current);
          }
        }}
        onClose={handleCreateDialogClose}
      >
        <div className={styles.drawerHeader}>
          <div>
            <p className={styles.drawerEyebrow}>PROGRAMAÇÃO FIXA</p>
            <h2 id={createModalTitleId} className={styles.drawerTitle}>
              Novo evento recorrente
            </h2>
          </div>

          <button
            type="button"
            aria-label="Fechar formulário"
            className={styles.drawerCloseButton}
            onClick={() => closeAnimatedDialog(createDialogRef.current)}
          >
            <CloseIcon />
          </button>
        </div>

        <form
          className={styles.drawerForm}
          noValidate
          onSubmit={handleCreateSubmit}
        >
          <div className={styles.drawerBody}>
            <div className={styles.fieldGroup}>
              <label htmlFor={titleInputId} className={styles.fieldLabel}>
                Nome do evento
              </label>
              <input
                ref={titleInputRef}
                id={titleInputId}
                name="eventTitle"
                type="text"
                value={eventTitle}
                placeholder="Ex.: Culto de Celebração"
                required
                minLength={2}
                maxLength={80}
                aria-invalid={titleError ? "true" : "false"}
                aria-describedby={titleError ? titleErrorId : undefined}
                className={`${styles.input} ${
                  titleError ? styles.inputError : ""
                }`}
                onChange={(event) => {
                  setEventTitle(event.currentTarget.value);
                  if (titleError) setTitleError("");
                }}
              />
              {titleError && (
                <div id={titleErrorId} className={styles.errorMsg}>
                  <AlertCircleIcon className={styles.errorIcon} />
                  <span>{titleError}</span>
                </div>
              )}
            </div>

            <div className={styles.twoColFields}>
              <div className={styles.fieldGroup}>
                <label htmlFor={weekdaySelectId} className={styles.fieldLabel}>
                  Dia da semana
                </label>
                <select
                  id={weekdaySelectId}
                  name="weekday"
                  value={weekday}
                  className={styles.select}
                  onChange={(event) => setWeekday(event.currentTarget.value)}
                >
                  {WEEKDAY_OPTIONS.map((day) => (
                    <option key={day.value} value={day.value}>
                      {day.value}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.fieldGroup}>
                <label htmlFor={timeInputId} className={styles.fieldLabel}>
                  Horário
                </label>
                <input
                  ref={timeInputRef}
                  id={timeInputId}
                  name="eventTime"
                  type="time"
                  value={eventTime}
                  required
                  aria-invalid={timeError ? "true" : "false"}
                  aria-describedby={timeError ? timeErrorId : undefined}
                  className={`${styles.input} ${
                    timeError ? styles.inputError : ""
                  }`}
                  onChange={(event) => {
                    setEventTime(event.currentTarget.value);
                    if (timeError) setTimeError("");
                  }}
                />
                {timeError && (
                  <div id={timeErrorId} className={styles.errorMsg}>
                    <AlertCircleIcon className={styles.errorIcon} />
                    <span>{timeError}</span>
                  </div>
                )}
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor={ministrySelectId} className={styles.fieldLabel}>
                Ministério
              </label>
              <select
                id={ministrySelectId}
                name="ministryName"
                value={ministryName}
                className={styles.select}
                onChange={(event) => setMinistryName(event.currentTarget.value)}
              >
                {availableMinistryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.drawerFooter}>
            <button
              type="button"
              className={styles.drawerCancelButton}
              onClick={() => closeAnimatedDialog(createDialogRef.current)}
            >
              Cancelar
            </button>
            <button type="submit" className={styles.drawerSubmitButton}>
              Criar evento
            </button>
          </div>
        </form>
      </dialog>

      <dialog
        ref={deleteDialogRef}
        closedby="any"
        aria-labelledby={deleteModalTitleId}
        className={styles.modalDialog}
        onClose={handleDeleteDialogClose}
      >
        <form method="dialog" className={styles.modalForm}>
          <div className={styles.deleteModalLead}>
            <span className={styles.deleteModalBadge} aria-hidden="true">
              <TrashIcon />
            </span>
            <div>
              <h2 id={deleteModalTitleId} className={styles.modalTitle}>
                Excluir evento recorrente?
              </h2>
              <p className={styles.modalSubtitle}>
                O modelo{" "}
                <strong>
                  {pendingDeleteEvent ? pendingDeleteEvent.title : ""}
                </strong>{" "}
                será removido da programação fixa semanal.
              </p>
            </div>
          </div>

          <div className={styles.modalActions}>
            <button
              type="submit"
              value="cancel"
              autoFocus
              className={styles.modalCancelButton}
            >
              Cancelar
            </button>
            <button
              type="submit"
              value="confirm"
              className={styles.modalDangerButton}
            >
              Excluir evento
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
