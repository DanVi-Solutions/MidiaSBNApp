"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  CalendarXIcon,
  CheckIcon,
  CloseIcon,
  PlusIcon,
} from "@/components/ui/icons";
import {
  DAY_SLOTS,
  INITIAL_WEEKLY_AVAILABILITY,
  WEEK_DAYS,
} from "@/features/availability/data/mockAvailabilityData";
import {
  compareIsoDates,
  countInclusiveDays,
  countUniqueUnavailableDays,
  formatCalendarDatePtBr,
  formatDurationDaysPtBr,
} from "@/features/availability/utils/calendarDates";
import styles from "./AvailabilityView.module.css";

function updateDaySlots(currentSlots, slotId, checked) {
  if (slotId === "unavailable") {
    return checked ? ["unavailable"] : [];
  }

  if (slotId === "allDay") {
    return checked ? ["allDay"] : [];
  }

  const withoutExclusive = currentSlots.filter(
    (id) => id !== "unavailable" && id !== "allDay"
  );

  if (checked) {
    return withoutExclusive.includes(slotId)
      ? withoutExclusive
      : [...withoutExclusive, slotId];
  }

  return withoutExclusive.filter((id) => id !== slotId);
}

export function AvailabilityView() {
  const toast = useToast();
  const weeklyHeadingId = useId();
  const exceptionsHeadingId = useId();
  const singleDateId = useId();
  const rangeStartId = useId();
  const rangeEndId = useId();
  const formErrorId = useId();

  const singleDateRef = useRef(null);
  const rangeStartRef = useRef(null);
  const rangeEndRef = useRef(null);
  const announceTimerRef = useRef(null);

  const [weeklyAvailability, setWeeklyAvailability] = useState(
    INITIAL_WEEKLY_AVAILABILITY
  );
  const [exceptionMode, setExceptionMode] = useState("single");
  const [singleDate, setSingleDate] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [exceptions, setExceptions] = useState([]);
  const [formError, setFormError] = useState("");
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  useEffect(() => {
    return () => {
      if (announceTimerRef.current !== null) {
        window.clearTimeout(announceTimerRef.current);
      }
    };
  }, []);

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

  const rangePreviewDays = useMemo(() => {
    if (exceptionMode !== "range" || !rangeStart || !rangeEnd) return null;
    if (compareIsoDates(rangeEnd, rangeStart) < 0) return null;
    return countInclusiveDays(rangeStart, rangeEnd);
  }, [exceptionMode, rangeStart, rangeEnd]);

  const totalUnavailableDays = useMemo(
    () => countUniqueUnavailableDays(exceptions),
    [exceptions]
  );

  const handleToggleSlot = (dayId, slotId, checked) => {
    setWeeklyAvailability((prev) => ({
      ...prev,
      [dayId]: updateDaySlots(prev[dayId] ?? [], slotId, checked),
    }));
  };

  const handleModeChange = (nextMode) => {
    setExceptionMode(nextMode);
    setFormError("");
    announce("");
  };

  const handleAddException = (event) => {
    event.preventDefault();

    let startIso = "";
    let endIso = "";

    if (exceptionMode === "single") {
      if (!singleDate) {
        const msg = "Selecione uma data específica para adicionar.";
        setFormError(msg);
        announce(msg);
        toast.error(msg);
        singleDateRef.current?.focus();
        return;
      }
      startIso = singleDate;
      endIso = singleDate;
    } else {
      if (!rangeStart) {
        const msg = "Informe a data de início do período indisponível.";
        setFormError(msg);
        announce(msg);
        toast.error(msg);
        rangeStartRef.current?.focus();
        return;
      }
      if (!rangeEnd) {
        const msg = "Informe a data de término do período indisponível.";
        setFormError(msg);
        announce(msg);
        toast.error(msg);
        rangeEndRef.current?.focus();
        return;
      }
      if (compareIsoDates(rangeEnd, rangeStart) < 0) {
        const msg =
          "A data de término deve ser igual ou posterior à data de início.";
        setFormError(msg);
        announce(msg);
        toast.error(msg);
        rangeEndRef.current?.focus();
        return;
      }
      startIso = rangeStart;
      endIso = rangeEnd;
    }

    const isDuplicate = exceptions.some(
      (item) => item.startDate === startIso && item.endDate === endIso
    );
    if (isDuplicate) {
      const msg = "Esta data ou período já foi adicionado.";
      setFormError(msg);
      announce(msg);
      toast.error(msg);
      return;
    }

    const days = countInclusiveDays(startIso, endIso);
    const nextItem = {
      id: `${startIso}__${endIso}`,
      mode: startIso === endIso ? "single" : "range",
      startDate: startIso,
      endDate: endIso,
      days,
    };

    setExceptions((prev) =>
      [...prev, nextItem].sort((left, right) => {
        const startDiff = compareIsoDates(left.startDate, right.startDate);
        if (startDiff !== 0) return startDiff;
        return compareIsoDates(left.endDate, right.endDate);
      })
    );

    setFormError("");
    if (exceptionMode === "single") {
      setSingleDate("");
      toast.success(
        `Exceção adicionada: ${formatCalendarDatePtBr(startIso)} (${formatDurationDaysPtBr(days)}).`
      );
    } else {
      setRangeStart("");
      setRangeEnd("");
      toast.success(
        `Período indisponível adicionado: ${formatCalendarDatePtBr(startIso)} até ${formatCalendarDatePtBr(endIso)} (${formatDurationDaysPtBr(days)}).`
      );
    }
  };

  const handleRemoveException = (item) => {
    setExceptions((prev) => prev.filter((entry) => entry.id !== item.id));
    const label =
      item.mode === "single"
        ? formatCalendarDatePtBr(item.startDate)
        : `${formatCalendarDatePtBr(item.startDate)} até ${formatCalendarDatePtBr(item.endDate)}`;
    toast.success(`Exceção removida: ${label}.`);
  };

  const handleSaveChanges = () => {
    toast.success("Disponibilidade atualizada com sucesso.");
  };

  const hasError = Boolean(formError);

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLead}>
          <p className={styles.pageEyebrow}>PLANEJAMENTO PESSOAL</p>
          <h1 className={styles.pageTitle}>Minha disponibilidade</h1>
          <p className={styles.pageSubtitle}>
            Informe quando você costuma estar disponível para servir.
          </p>
        </div>

        <button
          type="button"
          className={styles.saveButton}
          onClick={handleSaveChanges}
        >
          <CheckIcon />
          <span>Salvar alterações</span>
        </button>
      </header>

      <div className="visually-hidden" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

      <section className={styles.card} aria-labelledby={weeklyHeadingId}>
        <div className={styles.sectionHeader}>
          <h2 id={weeklyHeadingId} className={styles.sectionTitle}>
            Rotina semanal
          </h2>
          <p className={styles.sectionSubtitle}>
            Selecione um ou mais períodos para cada dia.
          </p>
        </div>

        <div
          tabIndex={0}
          role="region"
          aria-labelledby={weeklyHeadingId}
          className={styles.tableWrapper}
        >
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Dia</th>
                {DAY_SLOTS.map((slot) => (
                  <th key={slot.id} scope="col">
                    {slot.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {WEEK_DAYS.map((day) => {
                const selectedSlots = weeklyAvailability[day.id] ?? [];

                return (
                  <tr key={day.id}>
                    <th scope="row" className={styles.dayHeaderCell}>
                      {day.label}
                    </th>

                    {DAY_SLOTS.map((slot) => {
                      const isChecked = selectedSlots.includes(slot.id);
                      const isUnavailable = slot.tone === "unavailable";
                      const inputId = `${day.id}-${slot.id}`;

                      return (
                        <td key={slot.id} className={styles.slotCell}>
                          <label
                            htmlFor={inputId}
                            className={`${styles.slotControl} ${
                              isChecked
                                ? isUnavailable
                                  ? styles.slotControlUnavailable
                                  : styles.slotControlAvailable
                                : ""
                            }`}
                          >
                            <input
                              id={inputId}
                              type="checkbox"
                              checked={isChecked}
                              className={`visually-hidden ${styles.slotInput}`}
                              onChange={(event) =>
                                handleToggleSlot(
                                  day.id,
                                  slot.id,
                                  event.currentTarget.checked
                                )
                              }
                            />
                            <span
                              aria-hidden="true"
                              className={`${styles.checkboxBox} ${
                                isChecked
                                  ? isUnavailable
                                    ? styles.checkboxBoxUnavailable
                                    : styles.checkboxBoxAvailable
                                  : ""
                              }`}
                            >
                              {isChecked && (
                                <CheckIcon className={styles.checkGlyph} />
                              )}
                            </span>
                            <span
                              aria-hidden="true"
                              className={styles.slotMobileLabel}
                            >
                              {slot.label}
                            </span>
                            <span className="visually-hidden">
                              {day.label}: {slot.label}
                            </span>
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.card} aria-labelledby={exceptionsHeadingId}>
        <div className={styles.exceptionsTopRow}>
          <div>
            <p className={styles.exceptionsEyebrow}>EXCEÇÕES</p>
            <h2 id={exceptionsHeadingId} className={styles.sectionTitle}>
              Datas ou períodos indisponíveis
            </h2>
            <p className={styles.sectionSubtitle}>
              Viagens, compromissos ou situações pontuais.
            </p>
          </div>

          {exceptions.length > 0 && (
            <span className={styles.totalDurationBadge}>
              Tempo total indisponível:{" "}
              <strong>{formatDurationDaysPtBr(totalUnavailableDays)}</strong>
            </span>
          )}
        </div>

        <form
          className={styles.exceptionForm}
          noValidate
          onSubmit={handleAddException}
        >
          <fieldset className={styles.modeFieldset}>
            <legend className="visually-hidden">
              Tipo de indisponibilidade
            </legend>

            <label
              className={`${styles.modeOption} ${
                exceptionMode === "single" ? styles.modeOptionActive : ""
              }`}
            >
              <input
                type="radio"
                name="exceptionMode"
                value="single"
                checked={exceptionMode === "single"}
                className={`visually-hidden ${styles.modeRadio}`}
                onChange={() => handleModeChange("single")}
              />
              <span>Data específica</span>
            </label>

            <label
              className={`${styles.modeOption} ${
                exceptionMode === "range" ? styles.modeOptionActive : ""
              }`}
            >
              <input
                type="radio"
                name="exceptionMode"
                value="range"
                checked={exceptionMode === "range"}
                className={`visually-hidden ${styles.modeRadio}`}
                onChange={() => handleModeChange("range")}
              />
              <span>Período</span>
            </label>
          </fieldset>

          {exceptionMode === "single" ? (
            <div className={styles.inputsRow}>
              <div className={styles.dateField}>
                <label htmlFor={singleDateId} className={styles.dateLabel}>
                  Data
                </label>
                <input
                  ref={singleDateRef}
                  id={singleDateId}
                  type="date"
                  value={singleDate}
                  required
                  aria-invalid={hasError ? "true" : "false"}
                  aria-describedby={hasError ? formErrorId : undefined}
                  className={`${styles.dateInput} ${
                    hasError ? styles.dateInputError : ""
                  }`}
                  onChange={(event) => {
                    setSingleDate(event.currentTarget.value);
                    if (formError) setFormError("");
                  }}
                />
              </div>

              <button type="submit" className={styles.addExceptionButton}>
                <PlusIcon />
                <span>Adicionar data</span>
              </button>
            </div>
          ) : (
            <div className={styles.inputsRow}>
              <div className={styles.dateField}>
                <label htmlFor={rangeStartId} className={styles.dateLabel}>
                  Data de início
                </label>
                <input
                  ref={rangeStartRef}
                  id={rangeStartId}
                  type="date"
                  value={rangeStart}
                  required
                  aria-invalid={hasError && !rangeStart ? "true" : "false"}
                  aria-describedby={
                    hasError && !rangeStart ? formErrorId : undefined
                  }
                  className={`${styles.dateInput} ${
                    hasError && !rangeStart ? styles.dateInputError : ""
                  }`}
                  onChange={(event) => {
                    setRangeStart(event.currentTarget.value);
                    if (formError) setFormError("");
                  }}
                />
              </div>

              <div className={styles.dateField}>
                <label htmlFor={rangeEndId} className={styles.dateLabel}>
                  Data de término
                </label>
                <input
                  ref={rangeEndRef}
                  id={rangeEndId}
                  type="date"
                  value={rangeEnd}
                  min={rangeStart || undefined}
                  required
                  aria-invalid={hasError && Boolean(rangeStart) ? "true" : "false"}
                  aria-describedby={
                    hasError && Boolean(rangeStart) ? formErrorId : undefined
                  }
                  className={`${styles.dateInput} ${
                    hasError && Boolean(rangeStart) ? styles.dateInputError : ""
                  }`}
                  onChange={(event) => {
                    setRangeEnd(event.currentTarget.value);
                    if (formError) setFormError("");
                  }}
                />
              </div>

              {rangePreviewDays !== null && (
                <span className={styles.previewBadge}>
                  {formatDurationDaysPtBr(rangePreviewDays)}
                </span>
              )}

              <button type="submit" className={styles.addExceptionButton}>
                <PlusIcon />
                <span>Adicionar período</span>
              </button>
            </div>
          )}

          {hasError && (
            <div id={formErrorId} className={styles.formError}>
              <AlertCircleIcon className={styles.errorIcon} />
              <span>{formError}</span>
            </div>
          )}
        </form>

        {exceptions.length === 0 ? (
          <div className={styles.emptyExceptions}>
            <CalendarXIcon className={styles.emptyIcon} />
            <span>Nenhuma exceção adicionada.</span>
          </div>
        ) : (
          <ul
            className={styles.exceptionsList}
            aria-label="Lista de datas e períodos indisponíveis"
          >
            {exceptions.map((item) => {
              const formattedDate =
                item.mode === "single"
                  ? formatCalendarDatePtBr(item.startDate)
                  : `${formatCalendarDatePtBr(item.startDate)} → ${formatCalendarDatePtBr(item.endDate)}`;
              const durationLabel = formatDurationDaysPtBr(item.days);

              return (
                <li key={item.id} className={styles.exceptionItem}>
                  <div className={styles.exceptionDetails}>
                    <span className={styles.exceptionDateText}>
                      {formattedDate}
                    </span>
                    <span className={styles.exceptionTypeBadge}>
                      {item.mode === "single" ? "Data específica" : "Período"}
                    </span>
                  </div>

                  <div className={styles.exceptionRight}>
                    <span className={styles.exceptionDurationBadge}>
                      {durationLabel}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remover indisponibilidade de ${formattedDate}`}
                      className={styles.removeExceptionButton}
                      onClick={() => handleRemoveException(item)}
                    >
                      <CloseIcon />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
