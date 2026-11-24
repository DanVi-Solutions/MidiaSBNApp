"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { usePrivateWorkspace } from "@/components/layout/PrivateWorkspaceContext";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CloseIcon,
  PlusIcon,
} from "@/components/ui/icons";
import {
  createAgendaEvent,
  updateAgendaEvent,
} from "@/features/agenda/services/agendaService";
import {
  APP_TIME_ZONE,
  buildIsoDateTimeInZone,
  formatIsoDatePtBr,
  getTodayIsoInZone,
} from "@/features/schedules/utils/scheduleDates";
import {
  clearRightDrawerAttrs,
  closeAnimatedRightDrawer,
  openRightDrawer,
  setupRightDrawerOutsideCollapse,
  shouldIgnoreRightDrawerClose,
} from "@/lib/rightDrawer";
import { getDepartmentIds, isAdmin } from "@/lib/roles";
import styles from "./AgendaView.module.css";

function validateName(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "Informe o nome do evento.";
  if (trimmed.length < 2)
    return "O nome do evento deve ter pelo menos 2 caracteres.";
  if (trimmed.length > 80)
    return "O nome do evento pode ter no máximo 80 caracteres.";
  return "";
}

function validateDate(dateIso, todayIso, lastEditableDay) {
  if (!dateIso) return "Informe a data do evento.";
  if (dateIso < todayIso) return "Escolha uma data a partir de hoje.";
  if (lastEditableDay && dateIso > lastEditableDay) {
    return `A agenda está liberada até ${formatIsoDatePtBr(lastEditableDay)}.`;
  }
  return "";
}

const MAX_TIMES = 10;
const WALL_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

function validateTimes(slots, dateIso, todayIso) {
  const seen = new Set();
  for (const slot of slots) {
    if (!slot.value) return { error: "Preencha todos os horários ou remova os campos em branco.", slotId: slot.id };
    if (!WALL_TIME_REGEX.test(slot.value)) return { error: "Informe um horário válido.", slotId: slot.id };
    if (seen.has(slot.value)) return { error: `O horário ${slot.value} está repetido.`, slotId: slot.id };
    seen.add(slot.value);
    if (dateIso === todayIso) {
      const startsAt = new Date(buildIsoDateTimeInZone(dateIso, slot.value, APP_TIME_ZONE));
      if (startsAt <= new Date()) return { error: `O horário ${slot.value} de hoje já passou.`, slotId: slot.id };
    }
  }
  return { error: "", slotId: null };
}

const sameIds = (a, b) =>
  a.length === b.length && a.every((id) => b.includes(id));

const sortedTimesOf = (slots) => [...new Set(slots.map((slot) => slot.value))].sort();

const createSlots = (times) => times.map((value, index) => ({ id: index + 1, value }));

export function AgendaEventFormDrawer({
  mode = "create",
  event = null,
  window: agendaWindow,
  onSaved,
  onClose,
}) {
  const {
    currentUser,
    departments,
    notifySchedulesChanged,
    broadcastWorkspaceSync,
  } = usePrivateWorkspace();
  const toast = useToast();

  const isEditing = mode === "edit" && Boolean(event);
  const userIsAdmin = isAdmin(currentUser);
  const todayIso = useMemo(() => getTodayIsoInZone(APP_TIME_ZONE), []);
  const lastEditableDay = agendaWindow?.lastEditableDay || "";

  const managedIds = useMemo(
    () => (userIsAdmin ? null : new Set(getDepartmentIds(currentUser))),
    [currentUser, userIsAdmin],
  );
  const canToggle = (departmentId) =>
    !managedIds || managedIds.has(departmentId);

  const departmentOptions = useMemo(() => {
    const byId = new Map();
    for (const department of departments || []) {
      if (!managedIds || managedIds.has(department.id)) {
        byId.set(department.id, { id: department.id, name: department.name });
      }
    }
    for (const department of event?.departments || []) {
      if (!byId.has(department.id))
        byId.set(department.id, { id: department.id, name: department.name });
    }
    return [...byId.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    );
  }, [departments, event, managedIds]);

  const drawerTitleId = useId();
  const nameInputId = useId();
  const nameErrorId = useId();
  const dateInputId = useId();
  const dateErrorId = useId();
  const timesErrorId = useId();
  const locationInputId = useId();
  const descriptionInputId = useId();

  const dialogRef = useRef(null);
  const nameInputRef = useRef(null);
  const dateInputRef = useRef(null);
  const timeInputRefs = useRef(new Map());
  const isCleaningUpRef = useRef(false);

  const [name, setName] = useState(() => (isEditing ? event.name : ""));
  const [dateIso, setDateIso] = useState(() =>
    isEditing ? event.dateIso : "",
  );
  const [timeSlots, setTimeSlots] = useState(() => createSlots(isEditing ? event.times : ["19:00"]));
  const slotIdCounterRef = useRef(timeSlots.length);
  const [location, setLocation] = useState(() =>
    isEditing ? event.location : "",
  );
  const [description, setDescription] = useState(() =>
    isEditing ? event.description : "",
  );
  const [selectedIds, setSelectedIds] = useState(() =>
    isEditing ? event.departmentIds : [],
  );

  const [nameError, setNameError] = useState("");
  const [dateError, setDateError] = useState("");
  const [timesError, setTimesError] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    isCleaningUpRef.current = false;
    openRightDrawer(dialog);
    const rafId = window.requestAnimationFrame(() =>
      nameInputRef.current?.focus(),
    );

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

  const handleDialogClose = () => {
    const dialog = dialogRef.current;
    if (
      !dialog ||
      isCleaningUpRef.current ||
      shouldIgnoreRightDrawerClose(dialog)
    )
      return;
    dialog.returnValue = "";
    onClose?.();
  };

  const isRescheduling = isEditing && dateIso !== event.dateIso;
  const currentTimes = timeSlots.map((slot) => slot.value);
  const removedTimes = isEditing ? event.times.filter((value) => !currentTimes.includes(value)) : [];
  const scheduledDepartments = isEditing
    ? event.departments.filter((department) => department.scheduled)
    : [];
  const removedScheduled = scheduledDepartments.filter(
    (department) => !selectedIds.includes(department.id),
  );

  const addTimeSlot = () => {
    if (isSaving || timeSlots.length >= MAX_TIMES) return;
    slotIdCounterRef.current += 1;
    const nextId = slotIdCounterRef.current;
    setTimeSlots((prev) => [...prev, { id: nextId, value: "" }]);
    setTimesError("");
    window.requestAnimationFrame(() => timeInputRefs.current.get(nextId)?.focus());
  };

  const removeTimeSlot = (slotId) => {
    if (isSaving || timeSlots.length <= 1) return;
    setTimeSlots((prev) => prev.filter((slot) => slot.id !== slotId));
    setTimesError("");
  };

  const changeTimeSlot = (slotId, value) => {
    setTimeSlots((prev) => prev.map((slot) => (slot.id === slotId ? { ...slot, value } : slot)));
    setFormError("");
    setTimesError("");
  };

  const toggleDepartment = (departmentId) => {
    if (!canToggle(departmentId) || isSaving) return;
    setFormError("");
    setSelectedIds((prev) =>
      prev.includes(departmentId)
        ? prev.filter((id) => id !== departmentId)
        : [...prev, departmentId],
    );
  };

  const handleSubmit = async (submitEvent) => {
    submitEvent.preventDefault();
    if (isSaving) return;

    const nextNameError = validateName(name);
    const nextTimes = sortedTimesOf(timeSlots);
    const dateUnchanged = isEditing && dateIso === event.dateIso;
    const timesUnchanged = isEditing && nextTimes.join() === event.times.join();
    const nextDateError = dateUnchanged
      ? ""
      : validateDate(dateIso, todayIso, lastEditableDay);
    const slotsToCheck =
      dateUnchanged && isEditing ? timeSlots.filter((slot) => !event.times.includes(slot.value)) : timeSlots;
    const timesCheck =
      nextDateError || (dateUnchanged && timesUnchanged)
        ? { error: "", slotId: null }
        : validateTimes(slotsToCheck, dateIso, todayIso);
    setNameError(nextNameError);
    setDateError(nextDateError);
    setTimesError(timesCheck.error);
    setFormError("");

    if (nextNameError) return nameInputRef.current?.focus();
    if (nextDateError) return dateInputRef.current?.focus();
    if (timesCheck.error) return timeInputRefs.current.get(timesCheck.slotId)?.focus();
    const trimmed = {
      name: name.trim(),
      location: location.trim(),
      description: description.trim(),
    };

    let result;
    if (isEditing) {
      const patch = {};
      if (trimmed.name !== event.name) patch.name = trimmed.name;
      if (trimmed.location !== event.location)
        patch.location = trimmed.location || null;
      if (trimmed.description !== event.description)
        patch.description = trimmed.description || null;
      if (!dateUnchanged) patch.date = dateIso;
      if (!timesUnchanged) patch.times = nextTimes;
      if (!sameIds(selectedIds, event.departmentIds))
        patch.departmentIds = selectedIds;

      if (Object.keys(patch).length === 0) {
        await closeAnimatedRightDrawer(dialogRef.current);
        return;
      }
      setIsSaving(true);
      result = await updateAgendaEvent(event.id, patch);
    } else {
      setIsSaving(true);
      result = await createAgendaEvent({
        name: trimmed.name,
        ...(trimmed.location && { location: trimmed.location }),
        ...(trimmed.description && { description: trimmed.description }),
        date: dateIso,
        times: nextTimes,
        departmentIds: selectedIds,
      });
    }
    setIsSaving(false);

    if (!result.ok || !result.data) {
      setFormError(
        result.error || "Não foi possível salvar o evento. Tente novamente.",
      );
      return;
    }

    await onSaved?.();
    notifySchedulesChanged();
    broadcastWorkspaceSync();
    await closeAnimatedRightDrawer(dialogRef.current);
    toast.success(
      isEditing
        ? `Evento "${result.data.name}" atualizado.`
        : `Evento "${result.data.name}" salvo como rascunho. Publique-o para aparecer na agenda e nas escalas.`,
    );
  };

  return (
    <dialog
      ref={dialogRef}
      data-side-drawer="right"
      aria-labelledby={drawerTitleId}
      className={styles.createDrawer}
      onCancel={(cancelEvent) => {
        if (cancelEvent.cancelable) {
          cancelEvent.preventDefault();
          if (!isSaving) closeAnimatedRightDrawer(dialogRef.current);
        }
      }}
      onClose={handleDialogClose}
    >
      <div className={styles.drawerHeader}>
        <div>
          <p className={styles.drawerEyebrow}>AGENDA SOBRENATURAL</p>
          <h2 id={drawerTitleId} className={styles.drawerTitle}>
            {isEditing ? "Editar evento" : "Novo evento"}
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

      <form className={styles.drawerForm} noValidate onSubmit={handleSubmit}>
        <div className={styles.drawerBody}>
          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <label htmlFor={nameInputId} className={styles.fieldLabel}>
                Nome do evento
              </label>
              <span className={styles.requiredTag}>Obrigatório</span>
            </div>
            <input
              ref={nameInputRef}
              id={nameInputId}
              name="name"
              type="text"
              value={name}
              placeholder="Ex.: Profetizando"
              maxLength={80}
              aria-invalid={nameError ? "true" : "false"}
              aria-describedby={nameError ? nameErrorId : undefined}
              className={`${styles.input} ${nameError ? styles.inputError : ""}`}
              onChange={(changeEvent) => {
                setName(changeEvent.currentTarget.value);
                setFormError("");
                if (nameError) setNameError("");
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
              <label htmlFor={dateInputId} className={styles.fieldLabel}>
                Data
              </label>
              <span className={styles.requiredTag}>Obrigatório</span>
            </div>
            <input
              ref={dateInputRef}
              id={dateInputId}
              name="date"
              type="date"
              value={dateIso}
              min={todayIso}
              max={lastEditableDay || undefined}
              aria-invalid={dateError ? "true" : "false"}
              aria-describedby={dateError ? dateErrorId : undefined}
              className={`${styles.input} ${dateError ? styles.inputError : ""}`}
              onChange={(changeEvent) => {
                setDateIso(changeEvent.currentTarget.value);
                setFormError("");
                if (dateError) setDateError("");
              }}
            />
            {dateError && (
              <div id={dateErrorId} className={styles.errorMsg}>
                <AlertCircleIcon className={styles.errorIcon} />
                <span>{dateError}</span>
              </div>
            )}
          </div>

          <fieldset className={styles.timesFieldset} aria-describedby={timesError ? timesErrorId : undefined}>
            <legend className={styles.fieldsetLegendRow}>
              <span>Horários</span>
              <span className={styles.requiredTag}>Obrigatório</span>
            </legend>
            <div className={styles.timesCard}>
              <div className={styles.timesHeaderMeta}>
                <p className={styles.timesHint}>Cada horário vira uma escala para cada ministério indicado.</p>
                <span className={styles.timesCounter}>
                  {timeSlots.length} / {MAX_TIMES}
                </span>
              </div>
              <div className={styles.timeSlotsList}>
                {timeSlots.map((slot, index) => (
                  <div key={slot.id} className={styles.timeSlotRow}>
                    <label htmlFor={`${drawerTitleId}-time-${slot.id}`} className="visually-hidden">
                      Horário {index + 1}
                    </label>
                    <input
                      ref={(node) => {
                        if (node) timeInputRefs.current.set(slot.id, node);
                        else timeInputRefs.current.delete(slot.id);
                      }}
                      id={`${drawerTitleId}-time-${slot.id}`}
                      name="times"
                      type="time"
                      value={slot.value}
                      aria-invalid={timesError ? "true" : "false"}
                      className={`${styles.input} ${styles.timeSlotInput} ${timesError ? styles.inputError : ""}`}
                      onChange={(changeEvent) => changeTimeSlot(slot.id, changeEvent.currentTarget.value)}
                    />
                    {timeSlots.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remover horário ${index + 1}`}
                        title="Remover horário"
                        disabled={isSaving}
                        className={styles.removeTimeButton}
                        onClick={() => removeTimeSlot(slot.id)}
                      >
                        <CloseIcon />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                disabled={isSaving || timeSlots.length >= MAX_TIMES}
                className={styles.addTimeButton}
                onClick={addTimeSlot}
              >
                <PlusIcon />
                <span>Adicionar horário</span>
              </button>
            </div>
            {timesError && (
              <div id={timesErrorId} className={styles.errorMsg}>
                <AlertCircleIcon className={styles.errorIcon} />
                <span>{timesError}</span>
              </div>
            )}
          </fieldset>

          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <label htmlFor={locationInputId} className={styles.fieldLabel}>
                Local
              </label>
              <span className={styles.optionalTag}>Opcional</span>
            </div>
            <input
              id={locationInputId}
              name="location"
              type="text"
              value={location}
              placeholder="Ex.: Templo principal"
              maxLength={120}
              className={styles.input}
              onChange={(changeEvent) =>
                setLocation(changeEvent.currentTarget.value)
              }
            />
          </div>

          <div className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <label htmlFor={descriptionInputId} className={styles.fieldLabel}>
                Descrição
              </label>
              <span className={styles.optionalTag}>Opcional</span>
            </div>
            <textarea
              id={descriptionInputId}
              name="description"
              rows={2}
              value={description}
              maxLength={255}
              placeholder="Preletor, tema ou outras informações."
              className={styles.textarea}
              onChange={(changeEvent) =>
                setDescription(changeEvent.currentTarget.value)
              }
            />
          </div>

          <fieldset className={styles.scopeFieldset}>
            <legend className={styles.fieldsetLegendRow}>
              <span>Ministérios que vão servir</span>
              <span className={styles.optionalTag}>
                {selectedIds.length} selecionado(s)
              </span>
            </legend>
            {departmentOptions.length === 0 ? (
              <p className={styles.multiDeptHint}>
                Você não gerencia nenhum ministério para indicar.
              </p>
            ) : (
              <div className={styles.departmentCheckboxList}>
                {departmentOptions.map((department) => {
                  const selected = selectedIds.includes(department.id);
                  const locked = !canToggle(department.id);
                  return (
                    <label
                      key={department.id}
                      className={`${styles.departmentOption} ${selected ? styles.departmentOptionSelected : ""} ${
                        locked ? styles.departmentOptionLocked : ""
                      }`}
                      title={
                        locked ? "Indicado por outro líder geral" : undefined
                      }
                    >
                      <input
                        type="checkbox"
                        className={styles.departmentCheckbox}
                        checked={selected}
                        disabled={locked || isSaving}
                        onChange={() => toggleDepartment(department.id)}
                      />
                      <span className={styles.departmentOptionName}>
                        {department.name}
                      </span>
                      {locked && (
                        <span className={styles.departmentLockedTag}>
                          Outro líder
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          {(isRescheduling && scheduledDepartments.length > 0) ||
          (removedTimes.length > 0 && scheduledDepartments.length > 0) ||
          removedScheduled.length > 0 ? (
            <div className={styles.warningCallout} role="note">
              <AlertTriangleIcon className={styles.warningCalloutIcon} />
              <div>
                {isRescheduling && scheduledDepartments.length > 0 && (
                  <p>
                    Ao remarcar, quem já estava escalado sai das escalas deste
                    evento e é avisado. As escalas voltam para rascunho.
                  </p>
                )}
                {removedTimes.length > 0 && scheduledDepartments.length > 0 && (
                  <p>
                    As escalas {removedTimes.length === 1 ? "do horário" : "dos horários"}{" "}
                    {removedTimes.join(", ")} serão apagadas, e quem estava escalado será avisado.
                  </p>
                )}
                {removedScheduled.length > 0 && (
                  <p>
                    A escala de{" "}
                    {removedScheduled
                      .map((department) => department.name)
                      .join(", ")}{" "}
                    será apagada, e quem estava escalado será avisado.
                  </p>
                )}
              </div>
            </div>
          ) : null}

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
              ? "Salvando..."
              : isEditing
                ? "Salvar alterações"
                : "Salvar rascunho"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
