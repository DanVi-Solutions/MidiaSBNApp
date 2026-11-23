"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePrivateWorkspace } from "@/components/layout/PrivateShell";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CalendarXIcon,
  CheckIcon,
  CloseIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  TrashIcon,
} from "@/components/ui/icons";
import {
  buildUnavailabilityRangeIso,
  createUnavailability,
  DAY_SLOTS,
  deleteUnavailability,
  EMPTY_WEEKLY_AVAILABILITY,
  formatUnavailabilityForUi,
  getMyWeeklyAvailability,
  getMyWorshipService,
  saveMyWorshipService,
  listMyUnavailabilities,
  mapApiWeekToUi,
  mapUiWeekToApiDays,
  replaceMyWeeklyAvailability,
  sortUnavailabilities,
  updateUnavailability,
  WEEK_DAYS,
} from "@/features/availability/services/availabilityService";
import {
  compareIsoDates,
  countInclusiveDays,
  countUniqueUnavailableDays,
  formatCalendarDatePtBr,
  formatDateTimePtBrInZone,
  formatDurationDaysPtBr,
} from "@/features/availability/utils/calendarDates";
import { getTodayIsoInZone } from "@/features/schedules/utils/scheduleDates";
import { isAtLeast, ROLES } from "@/lib/roles";
import { WORSHIP_SERVICE_OPTIONS } from "@/lib/worshipServices";
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
    const next = withoutExclusive.includes(slotId)
      ? withoutExclusive
      : [...withoutExclusive, slotId];
    if (
      next.includes("morning") &&
      next.includes("afternoon") &&
      next.includes("evening")
    ) {
      return ["allDay"];
    }
    return next;
  }

  return withoutExclusive.filter((id) => id !== slotId);
}

function formatExceptionDisplay(item) {
  if (!item) return "";
  if (item.isFullDay) {
    return item.mode === "single"
      ? formatCalendarDatePtBr(item.startDate)
      : `${formatCalendarDatePtBr(item.startDate)} → ${formatCalendarDatePtBr(item.endDate)}`;
  }

  if (item.startDate === item.endDate) {
    return `${formatCalendarDatePtBr(item.startDate)} (${item.startTime} – ${item.endTime})`;
  }

  return `${formatCalendarDatePtBr(item.startDate)} ${item.startTime} → ${formatCalendarDatePtBr(item.endDate)} ${item.endTime}`;
}

async function fetchAvailabilityData() {
  const [weekRes, unavailRes, worshipRes] = await Promise.all([
    getMyWeeklyAvailability(),
    listMyUnavailabilities(),
    getMyWorshipService(),
  ]);

  if (!weekRes.ok || !unavailRes.ok || !worshipRes.ok) {
    return {
      ok: false,
      error:
        weekRes.error ||
        unavailRes.error ||
        worshipRes.error ||
        "Não foi possível carregar sua disponibilidade.",
    };
  }

  const mappedWeek = mapApiWeekToUi(weekRes.data);
  const mappedExceptions = sortUnavailabilities(
    (Array.isArray(unavailRes.data) ? unavailRes.data : [])
      .map(formatUnavailabilityForUi)
      .filter(Boolean)
  );

  return {
    ok: true,
    mappedWeek,
    mappedExceptions,
    worshipService: worshipRes.data?.worshipService ?? "",
  };
}

export function AvailabilityView() {
  const { currentUser } = usePrivateWorkspace();
  const toast = useToast();
  const isAvailabilityRestricted = isAtLeast(currentUser, ROLES.GENERAL_MANAGER);

  const weeklyHeadingId = useId();
  const worshipHeadingId = useId();
  const exceptionsHeadingId = useId();
  const singleDateId = useId();
  const rangeStartId = useId();
  const rangeEndId = useId();
  const reasonInputId = useId();
  const reasonHintId = useId();
  const formErrorId = useId();

  const singleDateRef = useRef(null);
  const rangeStartRef = useRef(null);
  const rangeEndRef = useRef(null);
  const announceTimerRef = useRef(null);

  const [todayIso] = useState(() => getTodayIsoInZone());
  const [isLoading, setIsLoading] = useState(() => !isAvailabilityRestricted);
  const [loadError, setLoadError] = useState("");
  const [weeklyAvailability, setWeeklyAvailability] = useState(
    () => ({ ...EMPTY_WEEKLY_AVAILABILITY })
  );
  const [savedWeeklySnapshot, setSavedWeeklySnapshot] = useState(null);
  const [worshipService, setWorshipService] = useState("");
  const [savedWorshipService, setSavedWorshipService] = useState("");
  const [isSavingWeekly, setIsSavingWeekly] = useState(false);

  const [exceptionMode, setExceptionMode] = useState("single");
  const [singleDate, setSingleDate] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [reason, setReason] = useState("");
  const [editingException, setEditingException] = useState(null);
  const [exceptions, setExceptions] = useState([]);
  const [formError, setFormError] = useState("");
  const [isSubmittingException, setIsSubmittingException] = useState(false);
  const [deletingExceptionId, setDeletingExceptionId] = useState("");
  const [conflictNotice, setConflictNotice] = useState(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  useEffect(() => {
    return () => {
      if (announceTimerRef.current !== null) {
        window.clearTimeout(announceTimerRef.current);
      }
    };
  }, []);

  const applyLoadedData = useCallback((result) => {
    setLoadError("");
    setWeeklyAvailability(result.mappedWeek);
    setSavedWeeklySnapshot(
      JSON.stringify(mapUiWeekToApiDays(result.mappedWeek))
    );
    setExceptions(result.mappedExceptions);
    setWorshipService(result.worshipService);
    setSavedWorshipService(result.worshipService);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (isAvailabilityRestricted) return undefined;
    let active = true;

    fetchAvailabilityData().then((result) => {
      if (!active) return;

      if (!result.ok) {
        setLoadError(result.error);
        setIsLoading(false);
        return;
      }

      applyLoadedData(result);
    });

    return () => {
      active = false;
    };
  }, [isAvailabilityRestricted, applyLoadedData]);

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

  const handleRetryLoad = async () => {
    if (isAvailabilityRestricted) return;
    setIsLoading(true);
    setLoadError("");

    const result = await fetchAvailabilityData();
    if (!result.ok) {
      setLoadError(result.error);
      setIsLoading(false);
      return;
    }

    applyLoadedData(result);
  };

  const hasUnsavedWeeklyChanges = useMemo(() => {
    if (savedWeeklySnapshot === null) return false;
    return (
      JSON.stringify(mapUiWeekToApiDays(weeklyAvailability)) !==
      savedWeeklySnapshot
    );
  }, [weeklyAvailability, savedWeeklySnapshot]);

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

  const resetExceptionForm = () => {
    setEditingException(null);
    setExceptionMode("single");
    setSingleDate("");
    setRangeStart("");
    setRangeEnd("");
    setReason("");
    setFormError("");
  };

  const handleModeChange = (nextMode) => {
    setExceptionMode(nextMode);
    setFormError("");
    announce("");
  };

  const handleStartEditException = (item) => {
    if (!item || isSubmittingException) return;
    setEditingException(item);
    setExceptionMode(item.mode);
    if (item.mode === "single") {
      setSingleDate(item.startDate);
      setRangeStart("");
      setRangeEnd("");
    } else {
      setRangeStart(item.startDate);
      setRangeEnd(item.endDate);
      setSingleDate("");
    }
    setReason(item.reason || "");
    setFormError("");

    window.requestAnimationFrame(() => {
      if (item.mode === "single") {
        singleDateRef.current?.focus();
      } else {
        rangeStartRef.current?.focus();
      }
    });
  };

  const applySavedConflictNotice = (savedData) => {
    const conflicts = Array.isArray(savedData?.conflictingAssignments)
      ? savedData.conflictingAssignments
      : [];

    if (conflicts.length > 0) {
      setConflictNotice({
        unavailabilityId: savedData.id,
        conflicts,
      });
      toast.error(
        `Atenção: você já está escalado em ${conflicts.length} ${
          conflicts.length === 1 ? "evento" : "eventos"
        } neste período. Peça troca na página de Escala.`
      );
    } else if (conflictNotice?.unavailabilityId === savedData?.id) {
      setConflictNotice(null);
    }
  };

  const handleAddOrUpdateException = async (event) => {
    event.preventDefault();
    if (isSubmittingException || isLoading || Boolean(loadError)) return;

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

    if (compareIsoDates(endIso, todayIso) < 0) {
      const msg =
        exceptionMode === "single"
          ? "Não é possível registrar uma data que já passou."
          : "A data de término não pode estar no passado.";
      setFormError(msg);
      announce(msg);
      toast.error(msg);
      if (exceptionMode === "single") {
        singleDateRef.current?.focus();
      } else {
        rangeEndRef.current?.focus();
      }
      return;
    }

    const isDuplicate = exceptions.some(
      (item) =>
        item.id !== editingException?.id &&
        item.startDate === startIso &&
        item.endDate === endIso
    );
    if (isDuplicate) {
      const msg = "Esta data ou período já está registrado.";
      setFormError(msg);
      announce(msg);
      toast.error(msg);
      return;
    }

    const trimmedReason = reason.trim();
    const rangeIso = buildUnavailabilityRangeIso(startIso, endIso);

    if (editingException) {
      const datesChanged =
        startIso !== editingException.startDate ||
        endIso !== editingException.endDate;
      const prevReason = (editingException.reason || "").trim();
      const reasonChanged = trimmedReason !== prevReason;

      const patch = {};
      if (datesChanged) {
        patch.startAt = rangeIso.startAt;
        patch.endAt = rangeIso.endAt;
      }
      if (reasonChanged) {
        patch.reason = trimmedReason || null;
      }

      if (Object.keys(patch).length === 0) {
        resetExceptionForm();
        return;
      }

      setFormError("");
      setIsSubmittingException(true);
      const result = await updateUnavailability(editingException.id, patch);
      setIsSubmittingException(false);

      if (!result.ok || !result.data) {
        const msg =
          result.error || "Não foi possível atualizar a indisponibilidade.";
        setFormError(msg);
        announce(msg);
        toast.error(msg);
        return;
      }

      const formatted = formatUnavailabilityForUi(result.data);
      if (formatted) {
        setExceptions((prev) =>
          sortUnavailabilities(
            prev.map((entry) =>
              entry.id === formatted.id ? formatted : entry
            )
          )
        );
      }

      resetExceptionForm();
      applySavedConflictNotice(result.data);
      const okMsg = "Indisponibilidade atualizada com sucesso.";
      announce(okMsg);
      toast.success(okMsg);
      return;
    }

    setFormError("");
    setIsSubmittingException(true);
    const result = await createUnavailability({
      startAt: rangeIso.startAt,
      endAt: rangeIso.endAt,
      reason: trimmedReason,
    });
    setIsSubmittingException(false);

    if (!result.ok || !result.data) {
      const msg =
        result.error || "Não foi possível registrar a indisponibilidade.";
      setFormError(msg);
      announce(msg);
      toast.error(msg);
      return;
    }

    const formatted = formatUnavailabilityForUi(result.data);
    if (formatted) {
      setExceptions((prev) =>
        sortUnavailabilities([
          ...prev.filter((entry) => entry.id !== formatted.id),
          formatted,
        ])
      );
    }

    const days = formatted?.days ?? countInclusiveDays(startIso, endIso);
    const savedStartIso = formatted?.startDate ?? startIso;
    const savedEndIso = formatted?.endDate ?? endIso;
    const savedMode = formatted?.mode ?? exceptionMode;

    setSingleDate("");
    setRangeStart("");
    setRangeEnd("");
    setReason("");
    applySavedConflictNotice(result.data);

    const successMsg =
      savedMode === "single"
        ? `Indisponibilidade registrada: ${formatCalendarDatePtBr(savedStartIso)} (${formatDurationDaysPtBr(days)}).`
        : `Período indisponível registrado: ${formatCalendarDatePtBr(savedStartIso)} até ${formatCalendarDatePtBr(savedEndIso)} (${formatDurationDaysPtBr(days)}).`;
    announce(successMsg);
    toast.success(successMsg);
  };

  const handleRemoveException = async (item) => {
    if (!item?.id || deletingExceptionId) return;

    setDeletingExceptionId(item.id);
    const result = await deleteUnavailability(item.id);
    setDeletingExceptionId("");

    if (!result.ok) {
      const msg =
        result.error || "Não foi possível remover esta indisponibilidade.";
      announce(msg);
      toast.error(msg);
      return;
    }

    setExceptions((prev) => prev.filter((entry) => entry.id !== item.id));
    if (editingException?.id === item.id) {
      resetExceptionForm();
    }
    if (conflictNotice?.unavailabilityId === item.id) {
      setConflictNotice(null);
    }

    const label = formatExceptionDisplay(item);
    const okMsg = `Exceção removida: ${label}.`;
    announce(okMsg);
    toast.success(okMsg);
  };

  const handleSaveChanges = async () => {
    if (isSavingWeekly || isLoading || Boolean(loadError)) return;

    setIsSavingWeekly(true);
    const payloadDays = mapUiWeekToApiDays(weeklyAvailability);
    const [result, worshipResult] = await Promise.all([
      replaceMyWeeklyAvailability(payloadDays),
      worshipService !== savedWorshipService
        ? saveMyWorshipService(worshipService)
        : Promise.resolve({ ok: true, data: { worshipService } }),
    ]);
    setIsSavingWeekly(false);

    if (!worshipResult.ok) {
      const msg =
        worshipResult.error || "Não foi possível salvar seu horário de culto.";
      announce(msg);
      toast.error(msg);
    } else {
      setSavedWorshipService(worshipResult.data?.worshipService ?? "");
    }

    if (!result.ok) {
      const msg =
        result.error || "Não foi possível salvar sua disponibilidade semanal.";
      announce(msg);
      toast.error(msg);
      return;
    }
    if (!worshipResult.ok) return;

    const mappedWeek = mapApiWeekToUi(result.data);
    setWeeklyAvailability(mappedWeek);
    setSavedWeeklySnapshot(JSON.stringify(mapUiWeekToApiDays(mappedWeek)));
    const okMsg = "Disponibilidade salva com sucesso.";
    announce(okMsg);
    toast.success(okMsg);
  };

  const hasError = Boolean(formError);
  const missingRangeStart = exceptionMode === "range" && !rangeStart;
  const isEditing = Boolean(editingException);

  if (isAvailabilityRestricted) {
    return (
      <div className={styles.page}>
        <header className={styles.pageHeader}>
          <div className={styles.headerLead}>
            <p className={styles.pageEyebrow}>PLANEJAMENTO PESSOAL</p>
            <h1 className={styles.pageTitle}>Disponibilidade</h1>
          </div>
        </header>

        <div className={styles.restrictedCard}>
          <p className={styles.restrictedTitle}>
            A página de disponibilidade é destinada apenas a membros
            voluntários, responsáveis das escalas e gerentes de ministério.
            Contas de Administrador e Líder Geral são exclusivas para gestão e
            não entram na escala.
          </p>
          <div className={styles.restrictedActions}>
            <Link href="/ministries" className={styles.restrictedPrimaryLink}>
              Ir para Ministérios
            </Link>
            <Link href="/schedule" className={styles.restrictedSecondaryLink}>
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
          <p className={styles.pageEyebrow}>PLANEJAMENTO PESSOAL</p>
          <h1 className={styles.pageTitle}>Minha disponibilidade</h1>
          <p className={styles.pageSubtitle}>
            Informe quando você costuma estar disponível para servir.
          </p>
        </div>

        <button
          type="button"
          className={styles.saveButton}
          disabled={isLoading || Boolean(loadError) || isSavingWeekly}
          aria-busy={isSavingWeekly}
          onClick={handleSaveChanges}
        >
          <CheckIcon />
          <span>{isSavingWeekly ? "Salvando..." : "Salvar alterações"}</span>
        </button>
      </header>

      <div className="visually-hidden" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

      {isLoading ? (
        <div className={styles.loadingCard} role="status">
          <p className={styles.loadingTitle}>
            Carregando sua disponibilidade e exceções...
          </p>
        </div>
      ) : loadError ? (
        <div className={styles.errorCard} role="alert">
          <AlertCircleIcon className={styles.errorIcon} />
          <div className={styles.errorCopy}>
            <p className={styles.errorTitle}>
              Não foi possível carregar sua disponibilidade
            </p>
            <p className={styles.errorDesc}>{loadError}</p>
          </div>
          <button
            type="button"
            className={styles.retryButton}
            onClick={handleRetryLoad}
          >
            <RefreshCwIcon />
            <span>Tentar novamente</span>
          </button>
        </div>
      ) : (
        <>
          <section className={styles.card} aria-labelledby={weeklyHeadingId}>
            <div className={styles.sectionHeaderRow}>
              <div className={styles.sectionHeader}>
                <h2 id={weeklyHeadingId} className={styles.sectionTitle}>
                  Rotina semanal
                </h2>
                <p className={styles.sectionSubtitle}>
                  Selecione um ou mais períodos para cada dia.
                </p>
              </div>

              {hasUnsavedWeeklyChanges && (
                <span className={styles.unsavedBadge}>
                  Alterações não salvas
                </span>
              )}
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
                                  name={`availability-${day.id}`}
                                  type="checkbox"
                                  checked={isChecked}
                                  disabled={isSavingWeekly}
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

          <section className={styles.card} aria-labelledby={worshipHeadingId}>
            <div className={styles.sectionHeaderRow}>
              <div className={styles.sectionHeader}>
                <h2 id={worshipHeadingId} className={styles.sectionTitle}>
                  Seu culto de domingo
                </h2>
                <p className={styles.sectionSubtitle}>
                  Em qual culto você costuma estar? Evitamos escalar você nesse
                  horário para que não perca o seu culto.
                </p>
              </div>

              {worshipService !== savedWorshipService && (
                <span className={styles.unsavedBadge}>
                  Alterações não salvas
                </span>
              )}
            </div>

            <div
              role="radiogroup"
              aria-labelledby={worshipHeadingId}
              className={styles.worshipOptions}
            >
              {WORSHIP_SERVICE_OPTIONS.map((option) => {
                const isSelected = worshipService === option.value;
                return (
                  <label
                    key={option.value}
                    className={`${styles.worshipOption} ${
                      isSelected ? styles.worshipOptionSelected : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="worshipService"
                      value={option.value}
                      checked={isSelected}
                      disabled={isSavingWeekly}
                      className="visually-hidden"
                      onChange={() => setWorshipService(option.value)}
                    />
                    <span className={styles.worshipOptionDay}>Domingo</span>
                    <span className={styles.worshipOptionTime}>
                      {option.label}
                    </span>
                    {isSelected && (
                      <CheckIcon className={styles.worshipOptionCheck} />
                    )}
                  </label>
                );
              })}
            </div>
          </section>

          <section
            className={styles.card}
            aria-labelledby={exceptionsHeadingId}
          >
            <div className={styles.exceptionsTopRow}>
              <div>
                <p className={styles.exceptionsEyebrow}>EXCEÇÕES</p>
                <h2 id={exceptionsHeadingId} className={styles.sectionTitle}>
                  Datas ou períodos indisponíveis
                </h2>
                <p className={styles.sectionSubtitle}>
                  Viagens, compromissos ou situações pontuais já salvos
                  automaticamente ao registrar.
                </p>
              </div>

              {exceptions.length > 0 && (
                <span className={styles.totalDurationBadge}>
                  Tempo total indisponível:{" "}
                  <strong>{formatDurationDaysPtBr(totalUnavailableDays)}</strong>
                </span>
              )}
            </div>

            {conflictNotice?.conflicts?.length > 0 && (
              <div className={styles.conflictBanner} role="alert">
                <div className={styles.conflictHeader}>
                  <div className={styles.conflictLead}>
                    <AlertTriangleIcon className={styles.conflictIcon} />
                    <div>
                      <p className={styles.conflictTitle}>
                        Você já está escalado durante esta ausência
                      </p>
                      <p className={styles.conflictDesc}>
                        Registrar indisponibilidade não remove sua participação
                        automaticamente. Solicite uma troca para os eventos
                        abaixo:
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="Dispensar aviso de conflito na escala"
                    className={styles.conflictDismissButton}
                    onClick={() => setConflictNotice(null)}
                  >
                    <CloseIcon />
                  </button>
                </div>

                <ul className={styles.conflictList}>
                  {conflictNotice.conflicts.map((conflict) => {
                    const schedule = conflict.schedule || {};
                    const deptName = schedule.department?.name;
                    return (
                      <li key={conflict.id} className={styles.conflictItem}>
                        <strong>{schedule.name || "Escala"}</strong>
                        {deptName ? ` • ${deptName}` : ""}
                        {schedule.scheduleAt
                          ? ` — ${formatDateTimePtBrInZone(schedule.scheduleAt)}`
                          : ""}
                      </li>
                    );
                  })}
                </ul>

                <div className={styles.conflictFooter}>
                  <Link href="/schedule" className={styles.conflictLink}>
                    Ver escalas e pedir troca
                  </Link>
                </div>
              </div>
            )}

            <form
              className={styles.exceptionForm}
              aria-labelledby={exceptionsHeadingId}
              noValidate
              onSubmit={handleAddOrUpdateException}
            >
              {isEditing && (
                <div className={styles.editingBanner}>
                  <span className={styles.editingText}>
                    Editando exceção de{" "}
                    <strong>{formatExceptionDisplay(editingException)}</strong>
                  </span>
                  <button
                    type="button"
                    className={styles.cancelEditButton}
                    disabled={isSubmittingException}
                    onClick={resetExceptionForm}
                  >
                    Cancelar edição
                  </button>
                </div>
              )}

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
                    disabled={isSubmittingException}
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
                    disabled={isSubmittingException}
                    className={`visually-hidden ${styles.modeRadio}`}
                    onChange={() => handleModeChange("range")}
                  />
                  <span>Período</span>
                </label>
              </fieldset>

              {exceptionMode === "single" ? (
                <div className={styles.inputsRow}>
                  <div className={styles.dateField}>
                    <div className={styles.fieldLabelRow}>
                      <label
                        htmlFor={singleDateId}
                        className={styles.dateLabel}
                      >
                        Data
                      </label>
                      <span className={styles.requiredTag}>Obrigatório</span>
                    </div>
                    <input
                      ref={singleDateRef}
                      id={singleDateId}
                      name="singleDate"
                      type="date"
                      value={singleDate}
                      min={todayIso}
                      required
                      disabled={isSubmittingException}
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

                  <button
                    type="submit"
                    className={styles.addExceptionButton}
                    disabled={isSubmittingException}
                    aria-busy={isSubmittingException}
                  >
                    {isEditing ? <CheckIcon /> : <PlusIcon />}
                    <span>
                      {isSubmittingException
                        ? isEditing
                          ? "Atualizando..."
                          : "Adicionando..."
                        : isEditing
                          ? "Salvar data"
                          : "Adicionar data"}
                    </span>
                  </button>
                </div>
              ) : (
                <div className={styles.inputsRow}>
                  <div className={styles.dateField}>
                    <div className={styles.fieldLabelRow}>
                      <label
                        htmlFor={rangeStartId}
                        className={styles.dateLabel}
                      >
                        Data de início
                      </label>
                      <span className={styles.requiredTag}>Obrigatório</span>
                    </div>
                    <input
                      ref={rangeStartRef}
                      id={rangeStartId}
                      name="rangeStart"
                      type="date"
                      value={rangeStart}
                      min={isEditing ? undefined : todayIso}
                      required
                      disabled={isSubmittingException}
                      aria-invalid={
                        hasError && missingRangeStart ? "true" : "false"
                      }
                      aria-describedby={
                        hasError && missingRangeStart ? formErrorId : undefined
                      }
                      className={`${styles.dateInput} ${
                        hasError && missingRangeStart
                          ? styles.dateInputError
                          : ""
                      }`}
                      onChange={(event) => {
                        setRangeStart(event.currentTarget.value);
                        if (formError) setFormError("");
                      }}
                    />
                  </div>

                  <div className={styles.dateField}>
                    <div className={styles.fieldLabelRow}>
                      <label htmlFor={rangeEndId} className={styles.dateLabel}>
                        Data de término
                      </label>
                      <span className={styles.requiredTag}>Obrigatório</span>
                    </div>
                    <input
                      ref={rangeEndRef}
                      id={rangeEndId}
                      name="rangeEnd"
                      type="date"
                      value={rangeEnd}
                      min={rangeStart || todayIso}
                      required
                      disabled={isSubmittingException}
                      aria-invalid={
                        hasError && !missingRangeStart ? "true" : "false"
                      }
                      aria-describedby={
                        hasError && !missingRangeStart ? formErrorId : undefined
                      }
                      className={`${styles.dateInput} ${
                        hasError && !missingRangeStart
                          ? styles.dateInputError
                          : ""
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

                  <button
                    type="submit"
                    className={styles.addExceptionButton}
                    disabled={isSubmittingException}
                    aria-busy={isSubmittingException}
                  >
                    {isEditing ? <CheckIcon /> : <PlusIcon />}
                    <span>
                      {isSubmittingException
                        ? isEditing
                          ? "Atualizando..."
                          : "Adicionando..."
                        : isEditing
                          ? "Salvar período"
                          : "Adicionar período"}
                    </span>
                  </button>
                </div>
              )}

              <div className={styles.reasonField}>
                <div className={styles.fieldLabelRow}>
                  <label htmlFor={reasonInputId} className={styles.dateLabel}>
                    Motivo
                  </label>
                  <span className={styles.optionalTag}>Opcional</span>
                </div>
                <input
                  id={reasonInputId}
                  name="reason"
                  type="text"
                  value={reason}
                  maxLength={255}
                  placeholder="Ex.: Viagem, compromisso familiar..."
                  disabled={isSubmittingException}
                  aria-describedby={reasonHintId}
                  className={styles.reasonInput}
                  onChange={(event) => {
                    setReason(event.currentTarget.value);
                    if (formError) setFormError("");
                  }}
                />
                <p id={reasonHintId} className={styles.fieldHint}>
                  Visível apenas para você — os líderes veem apenas o período.
                </p>
              </div>

              {hasError && (
                <div id={formErrorId} className={styles.formError} role="alert">
                  <AlertCircleIcon className={styles.errorIcon} />
                  <span>{formError}</span>
                </div>
              )}
            </form>

            {exceptions.length === 0 ? (
              <div className={styles.emptyExceptions}>
                <CalendarXIcon className={styles.emptyIcon} />
                <span>Nenhuma exceção registrada no momento.</span>
              </div>
            ) : (
              <ul
                className={styles.exceptionsList}
                aria-label="Lista de datas e períodos indisponíveis"
              >
                {exceptions.map((item) => {
                  const formattedDate = formatExceptionDisplay(item);
                  const durationLabel = formatDurationDaysPtBr(item.days);
                  const isDeletingItem = deletingExceptionId === item.id;
                  const isBeingEdited = editingException?.id === item.id;

                  return (
                    <li
                      key={item.id}
                      className={`${styles.exceptionItem} ${
                        isBeingEdited ? styles.exceptionItemEditing : ""
                      }`}
                    >
                      <div className={styles.exceptionMain}>
                        <div className={styles.exceptionDetails}>
                          <span className={styles.exceptionDateText}>
                            {formattedDate}
                          </span>
                          <span className={styles.exceptionTypeBadge}>
                            {item.mode === "single"
                              ? "Data específica"
                              : "Período"}
                          </span>
                        </div>
                        {item.reason && (
                          <p className={styles.exceptionReason}>
                            Motivo: {item.reason}
                          </p>
                        )}
                      </div>

                      <div className={styles.exceptionRight}>
                        <span className={styles.exceptionDurationBadge}>
                          {durationLabel}
                        </span>
                        <div className={styles.exceptionActions}>
                          <button
                            type="button"
                            aria-label={`Editar indisponibilidade de ${formattedDate}`}
                            title="Editar indisponibilidade"
                            disabled={isSubmittingException || isDeletingItem}
                            className={styles.editExceptionButton}
                            onClick={() => handleStartEditException(item)}
                          >
                            <PencilIcon />
                          </button>
                          <button
                            type="button"
                            aria-label={`Remover indisponibilidade de ${formattedDate}`}
                            title="Remover indisponibilidade"
                            disabled={isSubmittingException || isDeletingItem}
                            aria-busy={isDeletingItem}
                            className={styles.removeExceptionButton}
                            onClick={() => handleRemoveException(item)}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
