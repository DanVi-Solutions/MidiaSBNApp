"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePrivateWorkspace } from "@/components/layout/PrivateWorkspaceContext";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  CloseIcon,
  PlusIcon,
} from "@/components/ui/icons";
import {
  createRecurringEvent,
  MAX_RECURRING_EVENT_TIMES,
  normalizeWallTimeValue,
  updateRecurringEvent,
  WEEKDAY_OPTIONS,
} from "@/features/recurring-events/services/recurringEventsService";
import {
  clearRightDrawerAttrs,
  closeAnimatedRightDrawer,
  openRightDrawer,
  setupRightDrawerOutsideCollapse,
  shouldIgnoreRightDrawerClose,
} from "@/lib/rightDrawer";
import { getAssignableDepartments, isAdmin } from "@/lib/roles";
import styles from "./RecurringEventsView.module.css";

function validateEventTitle(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "Informe o nome do evento recorrente.";
  if (trimmed.length < 2) {
    return "O nome do evento deve ter pelo menos 2 caracteres.";
  }
  if (trimmed.length > 80) {
    return "O nome do evento pode ter no máximo 80 caracteres.";
  }
  return "";
}

function validateEventDescription(value) {
  const trimmed = String(value ?? "").trim();
  if (trimmed.length > 255) {
    return "A descrição pode ter no máximo 255 caracteres.";
  }
  return "";
}

const WALL_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function createInitialTimeSlots(rawTimes = ["18:00"]) {
  const values =
    Array.isArray(rawTimes) && rawTimes.length > 0 ? rawTimes : ["18:00"];
  return values.map((val, idx) => ({
    id: idx + 1,
    value: normalizeWallTimeValue(val),
  }));
}

export function RecurringEventFormDrawer({
  mode = "create",
  event = null,
  onClose,
}) {
  const { currentUser, departments, refreshRecurringEvents } =
    usePrivateWorkspace();
  const toast = useToast();

  const isEditing = mode === "edit" && Boolean(event);
  const userIsAdmin = isAdmin(currentUser);
  const assignableDepartments = useMemo(
    () => getAssignableDepartments(currentUser, departments),
    [currentUser, departments]
  );

  const drawerTitleId = useId();
  const titleInputId = useId();
  const titleErrorId = useId();
  const descriptionInputId = useId();
  const descriptionErrorId = useId();
  const weekdaySelectId = useId();
  const timesErrorId = useId();

  const initialSlots = createInitialTimeSlots(
    isEditing && Array.isArray(event.times) && event.times.length > 0
      ? event.times
      : ["18:00"]
  );

  const dialogRef = useRef(null);
  const titleInputRef = useRef(null);
  const timeInputRefs = useRef(new Map());
  const slotIdCounterRef = useRef(initialSlots.length + 1);
  const titleTouchedRef = useRef(false);
  const announceTimerRef = useRef(null);
  const isCleaningUpRef = useRef(false);

  const [eventName, setEventName] = useState(() =>
    isEditing ? event.name || "" : ""
  );
  const [eventDescription, setEventDescription] = useState(() =>
    isEditing ? event.description || "" : ""
  );
  const [weekdayCode, setWeekdayCode] = useState(() =>
    isEditing ? event.weekdayCode || "SUNDAY" : "SUNDAY"
  );
  const [timeSlots, setTimeSlots] = useState(initialSlots);

  const [titleError, setTitleError] = useState("");
  const [descriptionError, setDescriptionError] = useState("");
  const [timeError, setTimeError] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
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
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    isCleaningUpRef.current = false;
    openRightDrawer(dialog);
    const rafId = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
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
      canCollapse: () => !isSaving,
    });
  }, [isSaving]);

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

  const clearFormErrors = () => {
    setTitleError("");
    setDescriptionError("");
    setTimeError("");
    setFormError("");
  };

  const handleAddTimeSlot = () => {
    if (isSaving || timeSlots.length >= MAX_RECURRING_EVENT_TIMES) return;

    slotIdCounterRef.current += 1;
    const nextSlotId = slotIdCounterRef.current;
    setTimeSlots((prev) => [...prev, { id: nextSlotId, value: "" }]);
    if (timeError) setTimeError("");
    if (formError) setFormError("");

    window.requestAnimationFrame(() => {
      timeInputRefs.current.get(nextSlotId)?.focus();
    });
  };

  const handleRemoveTimeSlot = (slotId) => {
    if (isSaving || timeSlots.length <= 1) return;
    setTimeSlots((prev) => prev.filter((slot) => slot.id !== slotId));
    if (timeError) setTimeError("");
    if (formError) setFormError("");
  };

  const handleTimeSlotChange = (slotId, nextValue) => {
    setTimeSlots((prev) =>
      prev.map((slot) =>
        slot.id === slotId ? { ...slot, value: nextValue } : slot
      )
    );
    if (timeError) setTimeError("");
    if (formError) setFormError("");
  };

  const handleFormSubmit = async (submitEvent) => {
    submitEvent.preventDefault();
    if (isSaving) return;

    titleTouchedRef.current = true;
    clearFormErrors();

    const nextTitleError = validateEventTitle(eventName);
    const nextDescError = validateEventDescription(eventDescription);

    let nextTimeError = "";
    let invalidTimeSlotId = null;
    const seenTimes = new Set();
    const validTimes = [];

    if (timeSlots.length === 0) {
      nextTimeError = "Informe ao menos um horário para o evento.";
    } else {
      for (const slot of timeSlots) {
        const normalized = normalizeWallTimeValue(slot.value);
        if (!normalized) {
          nextTimeError =
            "Preencha todos os horários ou remova os campos em branco.";
          invalidTimeSlotId = slot.id;
          break;
        }
        if (!WALL_TIME_REGEX.test(normalized)) {
          nextTimeError = "Informe um horário válido no formato HH:mm.";
          invalidTimeSlotId = slot.id;
          break;
        }
        if (seenTimes.has(normalized)) {
          nextTimeError = `O horário ${normalized} está repetido. Informe horários diferentes.`;
          invalidTimeSlotId = slot.id;
          break;
        }
        seenTimes.add(normalized);
        validTimes.push(normalized);
      }
    }

    setTitleError(nextTitleError);
    setDescriptionError(nextDescError);
    setTimeError(nextTimeError);

    if (nextTitleError) {
      announce(nextTitleError);
      titleInputRef.current?.focus();
      return;
    }

    if (nextDescError) {
      announce(nextDescError);
      return;
    }

    if (nextTimeError) {
      announce(nextTimeError);
      if (invalidTimeSlotId !== null) {
        timeInputRefs.current.get(invalidTimeSlotId)?.focus();
      }
      return;
    }

    if (!isEditing && !userIsAdmin && assignableDepartments.length === 0) {
      const msg =
        "Você precisa gerenciar ao menos um ministério para criar um evento recorrente.";
      setFormError(msg);
      announce(msg);
      return;
    }

    const trimmedName = eventName.trim();
    const trimmedDescription = eventDescription.trim();
    const sortedTimes = [...validTimes].sort();

    if (isEditing && event) {
      const patch = {};
      if (trimmedName !== event.name) {
        patch.name = trimmedName;
      }
      if (trimmedDescription !== (event.description || "").trim()) {
        patch.description = trimmedDescription || null;
      }
      if (weekdayCode !== event.weekdayCode) {
        patch.weekday = weekdayCode;
      }

      const prevTimes = event.times || [];
      const timesChanged =
        sortedTimes.length !== prevTimes.length ||
        sortedTimes.some((value, idx) => value !== prevTimes[idx]);
      if (timesChanged) {
        patch.times = sortedTimes;
      }

      if (Object.keys(patch).length === 0) {
        await closeAnimatedRightDrawer(dialogRef.current);
        return;
      }

      setIsSaving(true);
      const result = await updateRecurringEvent(event.id, patch);
      setIsSaving(false);

      if (!result.ok || !result.data) {
        const msg =
          result.error ||
          "Não foi possível atualizar o evento recorrente. Tente novamente.";
        setFormError(msg);
        announce(msg);
        return;
      }

      await refreshRecurringEvents();
      await closeAnimatedRightDrawer(dialogRef.current);
      toast.success(`Evento recorrente "${result.data.name}" atualizado.`);
      return;
    }

    setIsSaving(true);
    const result = await createRecurringEvent({
      name: trimmedName,
      description: trimmedDescription,
      weekday: weekdayCode,
      times: sortedTimes,
    });
    setIsSaving(false);

    if (!result.ok || !result.data) {
      const msg =
        result.error ||
        "Não foi possível cadastrar o evento recorrente. Tente novamente.";
      setFormError(msg);
      announce(msg);
      return;
    }

    await refreshRecurringEvents();
    await closeAnimatedRightDrawer(dialogRef.current);
    toast.success(`Evento recorrente "${result.data.name}" cadastrado.`);
  };

  const automaticScopeLabel = userIsAdmin
    ? "Todos os ministérios (Evento geral)"
    : assignableDepartments.length > 0
      ? assignableDepartments.map((dept) => dept.name).join(", ")
      : "Nenhum ministério vinculado";

  const automaticScopeHint = userIsAdmin
    ? "Eventos criados por administradores ficam disponíveis para todos os ministérios."
    : "Este evento ficará disponível automaticamente apenas para os ministérios que você gerencia.";

  return (
    <dialog
      ref={dialogRef}
      data-side-drawer="right"
      aria-labelledby={drawerTitleId}
      className={styles.createDrawer}
      onCancel={(eventObj) => {
        if (eventObj.cancelable) {
          eventObj.preventDefault();
          if (!isSaving) {
            closeAnimatedRightDrawer(dialogRef.current);
          }
        }
      }}
      onClose={handleDialogClose}
    >
      <div className="visually-hidden" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

      <div className={styles.drawerHeader}>
        <div>
          <p className={styles.drawerEyebrow}>
            {isEditing ? "EDITAR MODELO" : "PROGRAMAÇÃO FIXA"}
          </p>
          <h2 id={drawerTitleId} className={styles.drawerTitle}>
            {isEditing ? "Editar evento recorrente" : "Novo evento recorrente"}
          </h2>
        </div>

        <button
          type="button"
          aria-label="Fechar formulário"
          className={styles.drawerCloseButton}
          disabled={isSaving}
          onClick={() => closeAnimatedRightDrawer(dialogRef.current)}
        >
          <CloseIcon />
        </button>
      </div>

      <form
        className={styles.drawerForm}
        noValidate
        onSubmit={handleFormSubmit}
      >
        <div className={styles.drawerBody}>
          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <label htmlFor={titleInputId} className={styles.fieldLabel}>
                Nome do evento
              </label>
              <span className={styles.requiredTag}>Obrigatório</span>
            </div>
            <input
              ref={titleInputRef}
              id={titleInputId}
              name="eventName"
              type="text"
              value={eventName}
              placeholder="Ex.: Culto de Celebração"
              required
              minLength={2}
              maxLength={80}
              aria-invalid={titleError ? "true" : "false"}
              aria-describedby={titleError ? titleErrorId : undefined}
              className={`${styles.input} ${
                titleError ? styles.inputError : ""
              }`}
              onChange={(e) => {
                const nextValue = e.currentTarget.value;
                setEventName(nextValue);
                if (formError) setFormError("");
                if (titleError && !validateEventTitle(nextValue)) {
                  setTitleError("");
                }
              }}
              onBlur={() => {
                if (titleTouchedRef.current || eventName.trim()) {
                  setTitleError(validateEventTitle(eventName));
                }
              }}
            />
            {titleError && (
              <div id={titleErrorId} className={styles.errorMsg}>
                <AlertCircleIcon className={styles.errorIcon} />
                <span>{titleError}</span>
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
              name="eventDescription"
              rows={2}
              value={eventDescription}
              maxLength={255}
              placeholder="Observações copiadas para as escalas geradas."
              aria-invalid={descriptionError ? "true" : "false"}
              aria-describedby={
                descriptionError ? descriptionErrorId : undefined
              }
              className={`${styles.textarea} ${
                descriptionError ? styles.inputError : ""
              }`}
              onChange={(e) => {
                const nextValue = e.currentTarget.value;
                setEventDescription(nextValue);
                if (formError) setFormError("");
                if (
                  descriptionError &&
                  !validateEventDescription(nextValue)
                ) {
                  setDescriptionError("");
                }
              }}
            />
            {descriptionError && (
              <div id={descriptionErrorId} className={styles.errorMsg}>
                <AlertCircleIcon className={styles.errorIcon} />
                <span>{descriptionError}</span>
              </div>
            )}
          </div>

          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <label htmlFor={weekdaySelectId} className={styles.fieldLabel}>
                Dia da semana
              </label>
              <span className={styles.requiredTag}>Obrigatório</span>
            </div>
            <select
              id={weekdaySelectId}
              name="weekday"
              value={weekdayCode}
              required
              className={styles.select}
              onChange={(e) => {
                setWeekdayCode(e.currentTarget.value);
                if (formError) setFormError("");
              }}
            >
              {WEEKDAY_OPTIONS.map((day) => (
                <option key={day.code} value={day.code}>
                  {day.label}
                </option>
              ))}
            </select>
          </div>

          <fieldset
            className={styles.timesFieldset}
            aria-describedby={timeError ? timesErrorId : undefined}
          >
            <legend className={styles.fieldsetLegendRow}>
              <span>Horários no mesmo dia</span>
              <span className={styles.requiredTag}>Obrigatório</span>
            </legend>

            <div className={styles.timesCard}>
              <div className={styles.timesHeaderMeta}>
                <p className={styles.timesHint}>
                  Adicione um ou mais horários em que o evento acontece neste
                  dia.
                </p>
                <span className={styles.timesCounter}>
                  {timeSlots.length} / {MAX_RECURRING_EVENT_TIMES}
                </span>
              </div>

              <div className={styles.timeSlotsList}>
                {timeSlots.map((slot, index) => {
                  const slotInputId = `${weekdaySelectId}-slot-${slot.id}`;
                  return (
                    <div key={slot.id} className={styles.timeSlotRow}>
                      <label htmlFor={slotInputId} className="visually-hidden">
                        Horário {index + 1}
                      </label>
                      <input
                        ref={(node) => {
                          if (node) {
                            timeInputRefs.current.set(slot.id, node);
                          } else {
                            timeInputRefs.current.delete(slot.id);
                          }
                        }}
                        id={slotInputId}
                        name="eventTimes"
                        type="time"
                        value={slot.value}
                        required
                        aria-invalid={timeError ? "true" : "false"}
                        className={`${styles.input} ${styles.timeSlotInput} ${
                          timeError ? styles.inputError : ""
                        }`}
                        onChange={(e) =>
                          handleTimeSlotChange(slot.id, e.currentTarget.value)
                        }
                      />
                      {timeSlots.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Remover horário ${index + 1}`}
                          title="Remover horário"
                          disabled={isSaving}
                          className={styles.removeTimeButton}
                          onClick={() => handleRemoveTimeSlot(slot.id)}
                        >
                          <CloseIcon />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={
                  isSaving || timeSlots.length >= MAX_RECURRING_EVENT_TIMES
                }
                className={styles.addTimeButton}
                onClick={handleAddTimeSlot}
              >
                <PlusIcon />
                <span>Adicionar horário</span>
              </button>
            </div>

            {timeError && (
              <div id={timesErrorId} className={styles.errorMsg}>
                <AlertCircleIcon className={styles.errorIcon} />
                <span>{timeError}</span>
              </div>
            )}
          </fieldset>

          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <span className={styles.fieldLabel}>Ministérios de uso</span>
              <span className={styles.optionalTag}>Somente leitura</span>
            </div>
            <div className={styles.readonlyScopeBox}>
              <strong className={styles.readonlyScopeValue}>
                {isEditing && event
                  ? event.isGeneral
                    ? "Todos os ministérios (Evento geral)"
                    : event.ministryName
                  : automaticScopeLabel}
              </strong>
              <p className={styles.readonlyScopeHint}>
                {isEditing
                  ? event?.isGeneral
                    ? "Este evento está liberado para todos os ministérios."
                    : "O escopo de ministérios é definido automaticamente na criação ou promoção."
                  : automaticScopeHint}
              </p>
            </div>
          </div>

          {formError && (
            <div className={styles.formBannerError} role="alert">
              <AlertCircleIcon className={styles.errorIcon} />
              <span>{formError}</span>
            </div>
          )}
        </div>

        <div className={styles.drawerFooter}>
          <button
            type="button"
            className={styles.drawerCancelButton}
            disabled={isSaving}
            onClick={() => closeAnimatedRightDrawer(dialogRef.current)}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSaving}
            aria-busy={isSaving}
            className={styles.drawerSubmitButton}
          >
            {isSaving
              ? isEditing
                ? "Salvando..."
                : "Criando..."
              : isEditing
                ? "Salvar alterações"
                : "Criar evento"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
