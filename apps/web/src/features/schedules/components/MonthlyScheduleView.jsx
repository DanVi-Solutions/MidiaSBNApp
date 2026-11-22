"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  ArrowRightIcon,
  CalendarIcon,
  CalendarPlusIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  InfoCircleIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  SwapIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { usePrivateWorkspace } from "@/components/layout/PrivateShell";
import { useToast } from "@/components/ui/ToastProvider";
import {
  ACTIVE_MINISTRY,
  CURRENT_USER,
  INITIAL_SUBSTITUTION_REQUEST,
  MINISTRY_TEAMMATES,
  MONTHLY_EVENTS,
  NEXT_SCHEDULE,
  SCHEDULE_MEMBERS,
  SCHEDULE_MINISTRIES,
} from "@/features/schedules/data/mockScheduleData";
import {
  compareScheduleEvents,
  formatMonthYearLabel,
  formatRecurringChipDate,
  formatScheduleDateDisplay,
  formatWeekdayShortTitle,
  getRemainingMonthOccurrencesForWeekday,
  getTodayIsoDate,
  normalizeWallTime,
  parseIsoDateParts,
} from "@/features/schedules/utils/scheduleDates";
import styles from "./MonthlyScheduleView.module.css";

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

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function validateTitleValue(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "Informe o nome do evento.";
  }
  if (trimmed.length < 2) {
    return "Digite pelo menos 2 caracteres para o nome do evento.";
  }
  return "";
}

function validateDateIsoValue(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "Informe uma data válida para a escala.";
  }
  if (!parseIsoDateParts(trimmed)) {
    return "Data inválida. Escolha uma data válida no calendário.";
  }
  return "";
}

function validateTimeValue(value) {
  if (!normalizeWallTime(value)) {
    return "Informe um horário válido no formato HH:MM.";
  }
  return "";
}

function doesEventMatchSearch(event, normalizedQuery) {
  if (!normalizedQuery) return true;
  const haystack = [
    event.title,
    event.ministryName,
    ...event.assignments.map((person) => `${person.name} ${person.handle ?? ""}`),
  ]
    .map(normalizeText)
    .join(" ");

  return haystack.includes(normalizedQuery);
}

export function MonthlyScheduleView() {
  const {
    markNotificationRead,
    activeMinistry,
    ministries,
    currentUser,
    recurringEvents,
  } = usePrivateWorkspace();
  const toast = useToast();

  const effectiveMinistryId = activeMinistry?.id || ACTIVE_MINISTRY.id;
  const effectiveUserId = currentUser?.id || CURRENT_USER.id;

  const searchInputId = useId();
  const scopeSelectId = useId();
  const modalTitleId = useId();
  const substituteSelectId = useId();
  const reasonInputId = useId();
  const substitutionTitleId = useId();

  const scheduleDrawerTitleId = useId();
  const recurringSelectId = useId();
  const recurringErrorId = useId();
  const drawerTitleInputId = useId();
  const drawerTitleErrorId = useId();
  const drawerDateInputId = useId();
  const drawerDateErrorId = useId();
  const drawerTimeInputId = useId();
  const drawerTimeErrorId = useId();
  const drawerMinistrySelectId = useId();
  const drawerDetailsInputId = useId();
  const confirmModalTitleId = useId();

  const absenceDialogRef = useRef(null);
  const substitutionDialogRef = useRef(null);
  const scheduleDialogRef = useRef(null);
  const confirmDialogRef = useRef(null);
  const confirmCancelBtnRef = useRef(null);
  const recurringSelectRef = useRef(null);
  const titleInputRef = useRef(null);
  const dateInputRef = useRef(null);
  const timeInputRef = useRef(null);
  const isDecidingSubstitutionRef = useRef(false);
  const idCounterRef = useRef(100);
  const announceTimerRef = useRef(null);

  const [events, setEvents] = useState(() =>
    [...MONTHLY_EVENTS].sort(compareScheduleEvents)
  );
  const [substitutionStatus, setSubstitutionStatus] = useState("pending");
  const [absenceDetails, setAbsenceDetails] = useState(null);
  const [suggestedSubstitute, setSuggestedSubstitute] = useState("");
  const [absenceReason, setAbsenceReason] = useState("");
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [scopeFilter, setScopeFilter] = useState("my-ministry");

  const [editingEventId, setEditingEventId] = useState(null);
  const [scheduleMode, setScheduleMode] = useState("specific");
  const [selectedRecurringId, setSelectedRecurringId] = useState("");
  const [recurringBaseIso, setRecurringBaseIso] = useState("");
  const [recurringError, setRecurringError] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDateIso, setFormDateIso] = useState("");
  const [formTime, setFormTime] = useState("19:00");
  const [formMinistryId, setFormMinistryId] = useState(effectiveMinistryId);
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [formDetails, setFormDetails] = useState("");
  const [dirtyFields, setDirtyFields] = useState({
    title: false,
    dateIso: false,
    time: false,
  });
  const [fieldErrors, setFieldErrors] = useState({
    title: "",
    dateIso: "",
    time: "",
  });

  const [confirmModal, setConfirmModal] = useState(null);

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
    const cleanAbsence =
      !("closedBy" in HTMLDialogElement.prototype) &&
      setupBackdropDismiss(absenceDialogRef.current, () =>
        absenceDialogRef.current?.close()
      );
    const cleanConfirm =
      !("closedBy" in HTMLDialogElement.prototype) &&
      setupBackdropDismiss(confirmDialogRef.current, () =>
        confirmDialogRef.current?.close("cancel")
      );
    const cleanSubstitution = setupBackdropDismiss(
      substitutionDialogRef.current,
      () => {
        closeAnimatedDialog(substitutionDialogRef.current);
      }
    );
    const cleanSchedule = setupBackdropDismiss(scheduleDialogRef.current, () => {
      closeAnimatedDialog(scheduleDialogRef.current);
    });

    return () => {
      if (cleanAbsence) cleanAbsence();
      if (cleanConfirm) cleanConfirm();
      if (cleanSubstitution) cleanSubstitution();
      if (cleanSchedule) cleanSchedule();
    };
  }, [closeAnimatedDialog]);

  const draftEventsCount = useMemo(
    () => events.filter((item) => item.statusTone === "draft").length,
    [events]
  );

  const nextUserSchedule = useMemo(() => {
    const userPublished = events.filter(
      (event) =>
        event.statusTone === "published" &&
        event.assignments.some((person) => person.memberId === effectiveUserId)
    );
    if (userPublished.length === 0) return null;

    const preferred =
      userPublished.find((event) => event.id === "ev-21") ||
      userPublished.find((event) => event.dateIso >= "2026-11-21") ||
      userPublished[0];

    const dateInfo = formatScheduleDateDisplay(preferred.dateIso);

    return {
      id: preferred.id,
      day: dateInfo.day,
      monthShort: dateInfo.monthShort,
      ministryName: preferred.ministryName,
      title: preferred.title,
      fullDateLabel: dateInfo.fullDateLabel,
      time: preferred.time,
      notice: preferred.details || NEXT_SCHEDULE.notice,
      checkInHint: NEXT_SCHEDULE.checkInHint,
    };
  }, [events, effectiveUserId]);

  const filteredEvents = useMemo(() => {
    const query = normalizeText(searchQuery);

    return events.filter((event) => {
      if (
        scopeFilter === "my-ministry" &&
        event.ministryId !== effectiveMinistryId
      ) {
        return false;
      }

      if (
        scopeFilter === "my-scales" &&
        !event.assignments.some((person) => person.memberId === effectiveUserId)
      ) {
        return false;
      }

      return doesEventMatchSearch(event, query);
    });
  }, [events, searchQuery, scopeFilter, effectiveMinistryId, effectiveUserId]);

  const isEditing = Boolean(editingEventId);
  const isRecurringCreate = !isEditing && scheduleMode === "recurring";

  const selectedRecurringEvent = useMemo(
    () =>
      recurringEvents.find((item) => item.id === selectedRecurringId) || null,
    [recurringEvents, selectedRecurringId]
  );

  const recurringOccurrences = useMemo(() => {
    if (!selectedRecurringEvent || !recurringBaseIso) return [];
    return getRemainingMonthOccurrencesForWeekday(
      selectedRecurringEvent.weekday,
      recurringBaseIso
    );
  }, [selectedRecurringEvent, recurringBaseIso]);

  const recurringMonthYearLabel = useMemo(
    () => (recurringBaseIso ? formatMonthYearLabel(recurringBaseIso) : ""),
    [recurringBaseIso]
  );

  const availableMinistries = useMemo(() => {
    const merged = [...SCHEDULE_MINISTRIES];
    const seenIds = new Set(merged.map((item) => item.id));
    const seenNames = new Set(merged.map((item) => item.name));

    for (const item of ministries || []) {
      if (!seenIds.has(item.id) && !seenNames.has(item.name)) {
        merged.push({ id: item.id, name: item.name });
        seenIds.add(item.id);
        seenNames.add(item.name);
      }
    }
    return merged;
  }, [ministries]);

  const resolveMinistryIdByName = useCallback(
    (ministryName) =>
      availableMinistries.find((item) => item.name === ministryName)?.id ||
      effectiveMinistryId,
    [availableMinistries, effectiveMinistryId]
  );

  const selectedDrawerMinistry =
    availableMinistries.find((item) => item.id === formMinistryId) ||
    availableMinistries[0];

  const visibleMembers = useMemo(() => {
    const matching = SCHEDULE_MEMBERS.filter(
      (member) =>
        member.ministryIds.includes(formMinistryId) ||
        selectedMemberIds.includes(member.id)
    );
    return matching.length > 0 ? matching : SCHEDULE_MEMBERS;
  }, [formMinistryId, selectedMemberIds]);

  const handleOpenSubstitutionDrawer = () => {
    const dialog = substitutionDialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.removeAttribute("data-closing");
    dialog.showModal();
  };

  const handleSubstitutionDecision = async (decision) => {
    if (isDecidingSubstitutionRef.current) return;
    isDecidingSubstitutionRef.current = true;

    try {
      await closeAnimatedDialog(substitutionDialogRef.current);
      setSubstitutionStatus(decision);
      markNotificationRead(INITIAL_SUBSTITUTION_REQUEST.id);

      const message =
        decision === "accepted"
          ? `Substituição aceita para ${INITIAL_SUBSTITUTION_REQUEST.eventTitle} (${INITIAL_SUBSTITUTION_REQUEST.dateTimeLabel}).`
          : `Substituição recusada. A liderança será notificada para reatribuir ${INITIAL_SUBSTITUTION_REQUEST.suggestedRole}.`;

      toast.success(message);
    } finally {
      isDecidingSubstitutionRef.current = false;
    }
  };

  const handleOpenAbsenceModal = () => {
    const dialog = absenceDialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
  };

  const handleAbsenceDialogClose = () => {
    const dialog = absenceDialogRef.current;
    if (!dialog) return;

    const action = dialog.returnValue;
    dialog.returnValue = "";

    if (action === "confirm") {
      setAbsenceDetails({
        substitute: suggestedSubstitute,
        reason: absenceReason.trim(),
      });
      const message = suggestedSubstitute
        ? `Solicitação de substituição enviada com indicação para ${suggestedSubstitute}.`
        : "Ausência comunicada ao responsável do ministério.";
      toast.success(message);
      setSuggestedSubstitute("");
      setAbsenceReason("");
    }
  };

  const handleCancelAbsence = () => {
    setAbsenceDetails(null);
    const dateLabel =
      nextUserSchedule?.fullDateLabel || NEXT_SCHEDULE.fullDateLabel;
    toast.success(`Participação mantida na escala de ${dateLabel}.`);
  };

  const resetScheduleFormValidation = () => {
    setDirtyFields({ title: false, dateIso: false, time: false });
    setFieldErrors({ title: "", dateIso: "", time: "" });
  };

  const openCreateScheduleDrawer = () => {
    const dialog = scheduleDialogRef.current;
    if (!dialog || dialog.open) return;

    setEditingEventId(null);
    setScheduleMode("specific");
    setSelectedRecurringId("");
    setRecurringBaseIso(getTodayIsoDate());
    setRecurringError("");
    setFormTitle("");
    setFormDateIso("");
    setFormTime("19:00");
    setFormMinistryId(effectiveMinistryId);
    setSelectedMemberIds([]);
    setFormDetails("");
    resetScheduleFormValidation();

    dialog.removeAttribute("data-closing");
    dialog.showModal();
    window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
  };

  const openEditScheduleDrawer = (event) => {
    const dialog = scheduleDialogRef.current;
    if (!dialog || dialog.open) return;

    setEditingEventId(event.id);
    setScheduleMode("specific");
    setSelectedRecurringId("");
    setRecurringError("");
    setFormTitle(event.title);
    setFormDateIso(event.dateIso);
    setFormTime(event.time);
    setFormMinistryId(event.ministryId);
    setSelectedMemberIds(event.assignments.map((person) => person.memberId));
    setFormDetails(event.details || "");
    resetScheduleFormValidation();

    dialog.removeAttribute("data-closing");
    dialog.showModal();
    window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
  };

  const applyRecurringSelection = (recurringId) => {
    setSelectedRecurringId(recurringId);
    setRecurringError("");

    const template = recurringEvents.find((item) => item.id === recurringId);
    if (!template) return;

    const nextMinistryId = resolveMinistryIdByName(template.ministryName);
    setFormMinistryId(nextMinistryId);
  };

  const handleSwitchToRecurringMode = () => {
    setScheduleMode("recurring");
    setRecurringBaseIso(getTodayIsoDate());
    setRecurringError("");
    resetScheduleFormValidation();

    if (recurringEvents.length > 0) {
      const existingTemplate = recurringEvents.find(
        (item) => item.id === selectedRecurringId
      );
      if (existingTemplate) {
        setFormMinistryId(
          resolveMinistryIdByName(existingTemplate.ministryName)
        );
      } else {
        const defaultTemplate =
          recurringEvents.find(
            (item) => item.ministryName === activeMinistry?.name
          ) || recurringEvents[0];
        applyRecurringSelection(defaultTemplate.id);
      }
    }
  };

  const handleSwitchToSpecificMode = () => {
    setScheduleMode("specific");
    setRecurringError("");
    resetScheduleFormValidation();
  };

  const handleToggleMember = (member) => {
    setSelectedMemberIds((prev) => {
      if (prev.includes(member.id)) {
        return prev.filter((id) => id !== member.id);
      }
      return [...prev, member.id];
    });
  };

  const handleFieldBlur = (field) => {
    if (!dirtyFields[field]) return;

    let errorMessage = "";
    if (field === "title") {
      errorMessage = validateTitleValue(formTitle);
    } else if (field === "dateIso") {
      errorMessage = validateDateIsoValue(formDateIso);
    } else if (field === "time") {
      errorMessage = validateTimeValue(formTime);
    }

    setFieldErrors((prev) =>
      prev[field] === errorMessage ? prev : { ...prev, [field]: errorMessage }
    );
    if (errorMessage) {
      announce(errorMessage);
    }
  };

  const handleScheduleSubmit = async (submitEvent) => {
    submitEvent.preventDefault();

    if (isRecurringCreate) {
      if (!selectedRecurringEvent) {
        const msg = "Selecione um evento recorrente.";
        setRecurringError(msg);
        announce(msg);
        recurringSelectRef.current?.focus();
        return;
      }

      if (recurringOccurrences.length === 0) {
        const msg = "Não há ocorrências restantes neste mês a partir de hoje.";
        setRecurringError(msg);
        announce(msg);
        recurringSelectRef.current?.focus();
        return;
      }

      const ministryObj = selectedDrawerMinistry;
      const normalizedTime =
        normalizeWallTime(selectedRecurringEvent.time) || "19:00";

      const createdEvents = recurringOccurrences.map((dateIso) => {
        const dateDisplay = formatScheduleDateDisplay(dateIso);

        idCounterRef.current += 1;
        return {
          id: `ev-custom-${idCounterRef.current}`,
          dateIso,
          day: dateDisplay.day,
          monthShort: dateDisplay.monthShort,
          weekdayShort: dateDisplay.weekdayShort,
          ministryId: ministryObj.id,
          ministryName: ministryObj.name,
          title: selectedRecurringEvent.title,
          time: normalizedTime,
          details: formDetails.trim(),
          statusLabel: "Rascunho",
          statusTone: "draft",
          assignments: [],
        };
      });

      setEvents((prev) =>
        [...prev, ...createdEvents].sort(compareScheduleEvents)
      );

      const firstCreated = createdEvents[0];
      const hiddenByScope =
        (scopeFilter === "my-ministry" &&
          firstCreated.ministryId !== effectiveMinistryId) ||
        (scopeFilter === "my-scales" &&
          !firstCreated.assignments.some((p) => p.memberId === effectiveUserId));

      if (hiddenByScope) {
        setScopeFilter("all-ministries");
      }

      if (
        searchQuery &&
        !doesEventMatchSearch(firstCreated, normalizeText(searchQuery))
      ) {
        setSearchQuery("");
      }

      await closeAnimatedDialog(scheduleDialogRef.current);

      const count = createdEvents.length;
      const toastMsg =
        count === 1
          ? `1 rascunho de "${selectedRecurringEvent.title}" adicionado à escala.`
          : `${count} rascunhos de "${selectedRecurringEvent.title}" adicionados à escala.`;
      toast.success(toastMsg);
      return;
    }

    const nextTitleError = validateTitleValue(formTitle);
    const nextDateError = validateDateIsoValue(formDateIso);
    const nextTimeError = validateTimeValue(formTime);

    setDirtyFields({ title: true, dateIso: true, time: true });
    setFieldErrors({
      title: nextTitleError,
      dateIso: nextDateError,
      time: nextTimeError,
    });

    if (nextTitleError) {
      announce(nextTitleError);
      titleInputRef.current?.focus();
      return;
    }

    if (nextDateError) {
      announce(nextDateError);
      dateInputRef.current?.focus();
      return;
    }

    if (nextTimeError) {
      announce(nextTimeError);
      timeInputRef.current?.focus();
      return;
    }

    const ministryObj =
      availableMinistries.find((item) => item.id === formMinistryId) ||
      availableMinistries[0];
    const dateDisplay = formatScheduleDateDisplay(formDateIso);
    const normalizedTime = normalizeWallTime(formTime);
    const existingEvent = editingEventId
      ? events.find((item) => item.id === editingEventId)
      : null;

    const nextAssignments = selectedMemberIds
      .map((memberId) => {
        const member = SCHEDULE_MEMBERS.find((item) => item.id === memberId);
        if (!member) return null;

        const existingAssignment = existingEvent?.assignments.find(
          (item) => item.memberId === memberId
        );
        if (existingAssignment) {
          return existingAssignment;
        }

        idCounterRef.current += 1;
        return {
          id: `asg-${idCounterRef.current}`,
          memberId: member.id,
          initials: member.initials,
          name: member.name,
          handle: member.handle,
          attendanceLabel: "Pendente",
          attendanceTone: "pending",
        };
      })
      .filter(Boolean);

    let savedEvent;
    if (existingEvent) {
      savedEvent = {
        ...existingEvent,
        dateIso: formDateIso,
        day: dateDisplay.day,
        monthShort: dateDisplay.monthShort,
        weekdayShort: dateDisplay.weekdayShort,
        ministryId: ministryObj.id,
        ministryName: ministryObj.name,
        title: formTitle.trim(),
        time: normalizedTime,
        details: formDetails.trim(),
        assignments: nextAssignments,
      };
      setEvents((prev) =>
        prev
          .map((item) => (item.id === existingEvent.id ? savedEvent : item))
          .sort(compareScheduleEvents)
      );
    } else {
      idCounterRef.current += 1;
      savedEvent = {
        id: `ev-custom-${idCounterRef.current}`,
        dateIso: formDateIso,
        day: dateDisplay.day,
        monthShort: dateDisplay.monthShort,
        weekdayShort: dateDisplay.weekdayShort,
        ministryId: ministryObj.id,
        ministryName: ministryObj.name,
        title: formTitle.trim(),
        time: normalizedTime,
        details: formDetails.trim(),
        statusLabel: "Rascunho",
        statusTone: "draft",
        assignments: nextAssignments,
      };
      setEvents((prev) => [...prev, savedEvent].sort(compareScheduleEvents));
    }

    const hiddenByScope =
      (scopeFilter === "my-ministry" &&
        savedEvent.ministryId !== effectiveMinistryId) ||
      (scopeFilter === "my-scales" &&
        !savedEvent.assignments.some((p) => p.memberId === effectiveUserId));

    if (hiddenByScope) {
      setScopeFilter("all-ministries");
    }

    if (searchQuery && !doesEventMatchSearch(savedEvent, normalizeText(searchQuery))) {
      setSearchQuery("");
    }

    await closeAnimatedDialog(scheduleDialogRef.current);

    const toastMsg = existingEvent
      ? `Alterações salvas na escala "${savedEvent.title}".`
      : `Rascunho "${savedEvent.title}" adicionado à escala.`;
    toast.success(toastMsg);
  };

  const openConfirmModal = (payload) => {
    const dialog = confirmDialogRef.current;
    if (!dialog || dialog.open) return;

    setConfirmModal(payload);
    dialog.showModal();
    window.requestAnimationFrame(() => {
      confirmCancelBtnRef.current?.focus();
    });
  };

  const handleConfirmDialogClose = () => {
    const dialog = confirmDialogRef.current;
    if (!dialog) return;

    const action = dialog.returnValue;
    dialog.returnValue = "";

    if (action === "confirm" && confirmModal) {
      if (confirmModal.type === "delete" && confirmModal.event) {
        setEvents((prev) =>
          prev.filter((item) => item.id !== confirmModal.event.id)
        );
        toast.success(
          `Escala "${confirmModal.event.title}" excluída definitivamente.`
        );
      } else if (confirmModal.type === "publish-one" && confirmModal.event) {
        setEvents((prev) =>
          prev.map((item) =>
            item.id === confirmModal.event.id
              ? { ...item, statusTone: "published", statusLabel: "Publicado" }
              : item
          )
        );
        toast.success(
          `Escala "${confirmModal.event.title}" publicada para a equipe.`
        );
      } else if (confirmModal.type === "publish-all") {
        setEvents((prev) =>
          prev.map((item) =>
            item.statusTone === "draft"
              ? { ...item, statusTone: "published", statusLabel: "Publicado" }
              : item
          )
        );
        toast.success(
          `Todas as ${confirmModal.count} escala(s) pendentes foram publicadas.`
        );
      }
    }

    setConfirmModal(null);
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLead}>
          <p className={styles.pageEyebrow}>PLANEJAMENTO MENSAL</p>
          <h1 className={styles.pageTitle}>Escala do mês</h1>
          <p className={styles.pageSubtitle}>
            Organize pessoas e eventos com clareza.
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            disabled={draftEventsCount === 0}
            className={styles.publishAllButton}
            onClick={() =>
              openConfirmModal({
                type: "publish-all",
                count: draftEventsCount,
              })
            }
          >
            <SendIcon />
            <span>
              {draftEventsCount > 0 ? "Publicar pendentes" : "Tudo publicado"}
            </span>
            {draftEventsCount > 0 && (
              <span className={styles.publishAllCount}>{draftEventsCount}</span>
            )}
          </button>

          <button
            type="button"
            className={styles.newScheduleButton}
            onClick={openCreateScheduleDrawer}
          >
            <CalendarPlusIcon />
            <span>Nova escala</span>
          </button>
        </div>
      </header>

      <div className="visually-hidden" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

      {substitutionStatus === "pending" && (
        <section
          className={styles.substitutionBanner}
          aria-label="Solicitação de substituição"
        >
          <div className={styles.substitutionMain}>
            <span className={styles.substitutionIconWrap} aria-hidden="true">
              <SwapIcon />
            </span>

            <div className={styles.substitutionBody}>
              <p className={styles.substitutionEyebrow}>AÇÃO NECESSÁRIA</p>
              <h2 className={styles.substitutionTitle}>
                Você foi sugerido para uma substituição
              </h2>
            </div>
          </div>

          <button
            type="button"
            className={styles.detailsButton}
            onClick={handleOpenSubstitutionDrawer}
          >
            <span>Mais detalhes</span>
            <ArrowRightIcon />
          </button>
        </section>
      )}

      {nextUserSchedule && (
        <section className={styles.heroCard} aria-label="Sua próxima escala">
          <div className={styles.heroDatePanel}>
            <span className={styles.heroDateLabel}>SUA PRÓXIMA ESCALA</span>
            <span className={styles.heroDay}>{nextUserSchedule.day}</span>
            <span className={styles.heroMonth}>
              {nextUserSchedule.monthShort}
            </span>
          </div>

          <div className={styles.heroBody}>
            <div className={styles.heroTopRow}>
              <div>
                <p className={styles.ministryKicker}>
                  {nextUserSchedule.ministryName}
                </p>
                <h2 className={styles.heroTitle}>{nextUserSchedule.title}</h2>
              </div>

              {absenceDetails ? (
                <span
                  className={`${styles.statusPill} ${styles.statusPillAmber}`}
                >
                  <span className={styles.statusDot} aria-hidden="true" />
                  Substituição solicitada
                </span>
              ) : (
                <span className={`${styles.statusPill} ${styles.statusPillInfo}`}>
                  <span className={styles.statusDot} aria-hidden="true" />
                  Você está escalado
                </span>
              )}
            </div>

            <div className={styles.heroFacts}>
              <span className={styles.factItem}>
                <CalendarIcon className={styles.factIcon} />
                <span>{nextUserSchedule.fullDateLabel}</span>
              </span>
              <span className={styles.factItem}>
                <ClockIcon className={styles.factIcon} />
                <span>{nextUserSchedule.time}</span>
              </span>
            </div>

            <div className={styles.noticeBox}>
              <InfoCircleIcon className={styles.noticeIcon} />
              <p>{nextUserSchedule.notice}</p>
            </div>

            <div className={styles.heroFooterRow}>
              <span className={styles.checkInHint}>
                <ClockIcon className={styles.checkInIcon} />
                <span>{nextUserSchedule.checkInHint}</span>
              </span>

              {absenceDetails ? (
                <button
                  type="button"
                  className={styles.absenceButton}
                  onClick={handleCancelAbsence}
                >
                  Cancelar solicitação
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.absenceButton}
                  onClick={handleOpenAbsenceModal}
                >
                  Não conseguirei participar
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      <search aria-label="Filtrar escalas do mês" className={styles.filterCard}>
        <div className={styles.searchFieldWrap}>
          <label htmlFor={searchInputId} className="visually-hidden">
            Pesquisar pelo nome do evento
          </label>
          <SearchIcon className={styles.searchIcon} />
          <input
            id={searchInputId}
            type="search"
            value={searchQuery}
            placeholder="Pesquisar pelo nome do evento..."
            autoCorrect="off"
            spellCheck={false}
            className={styles.searchInput}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
          />
        </div>

        <div className={styles.filterRightGroup}>
          <label htmlFor={scopeSelectId} className="visually-hidden">
            Filtrar visualização da escala
          </label>
          <select
            id={scopeSelectId}
            name="scheduleScope"
            value={scopeFilter}
            className={styles.scopeSelect}
            onChange={(event) => setScopeFilter(event.currentTarget.value)}
          >
            <option value="my-ministry">Escala do meu ministério</option>
            <option value="my-scales">Minhas escalas</option>
            <option value="all-ministries">Escala geral</option>
          </select>

          <span className={styles.eventCount}>
            {filteredEvents.length} evento(s)
          </span>
        </div>
      </search>

      <section
        className={styles.eventsList}
        aria-label="Lista de eventos do mês"
      >
        {filteredEvents.length === 0 ? (
          <div className={styles.emptyCard}>
            <p className={styles.emptyTitle}>
              Nenhum evento encontrado para este filtro.
            </p>
            <button
              type="button"
              className={styles.resetFilterButton}
              onClick={() => {
                setSearchQuery("");
                setScopeFilter("all-ministries");
              }}
            >
              Ver escala geral
            </button>
          </div>
        ) : (
          filteredEvents.map((event) => {
            const isPublished = event.statusTone === "published";
            const isUserScheduled = event.assignments.some(
              (person) => person.memberId === effectiveUserId
            );

            return (
              <article
                key={event.id}
                data-user-scheduled={isUserScheduled ? "true" : undefined}
                className={`${styles.eventCard} ${
                  isUserScheduled ? styles.eventCardAssigned : ""
                }`}
              >
                <div className={styles.eventDateColumn}>
                  <span className={styles.eventDay}>{event.day}</span>
                  <span className={styles.eventDateMeta}>
                    {event.monthShort} {event.weekdayShort}
                  </span>
                </div>

                <div className={styles.eventBody}>
                  <div className={styles.eventTopRow}>
                    <div>
                      <p className={styles.ministryKicker}>
                        {event.ministryName}
                      </p>
                      <h3 className={styles.eventTitle}>{event.title}</h3>
                    </div>

                    <span
                      className={`${styles.statusPill} ${
                        isPublished
                          ? styles.statusPillLime
                          : styles.statusPillDraft
                      }`}
                    >
                      <span className={styles.statusDot} aria-hidden="true" />
                      {event.statusLabel}
                    </span>
                  </div>

                  <div className={styles.eventMetaRow}>
                    <span className={styles.factItem}>
                      <ClockIcon className={styles.factIcon} />
                      <span>{event.time}</span>
                    </span>
                    <span className={styles.factItem}>
                      <UsersIcon className={styles.factIcon} />
                      <span>{event.assignments.length} escalado(s)</span>
                    </span>
                  </div>

                  {event.details && (
                    <div className={styles.eventDetailsNote}>
                      <InfoCircleIcon className={styles.factIcon} />
                      <span>{event.details}</span>
                    </div>
                  )}

                  {event.assignments.length === 0 ? (
                    <p className={styles.emptyAssignmentsHint}>
                      Nenhum membro escalado ainda.
                    </p>
                  ) : (
                    <div className={styles.assignmentsGrid}>
                      {event.assignments.map((person) => {
                        let badgeToneClass = styles.attendanceConfirmed;
                        if (person.attendanceTone === "present") {
                          badgeToneClass = styles.attendancePresent;
                        } else if (person.attendanceTone === "pending") {
                          badgeToneClass = styles.attendancePending;
                        }

                        return (
                          <div
                            key={person.id}
                            className={styles.assignmentChip}
                          >
                            <span
                              className={styles.memberInitials}
                              aria-hidden="true"
                            >
                              {person.initials}
                            </span>

                            <div className={styles.memberDetails}>
                              <span className={styles.memberName}>
                                {person.name}
                              </span>
                              <span className={styles.memberHandle}>
                                {person.handle}
                              </span>
                            </div>

                            <span
                              className={`${styles.attendanceBadge} ${badgeToneClass}`}
                            >
                              <span
                                className={styles.statusDot}
                                aria-hidden="true"
                              />
                              {person.attendanceLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className={styles.eventActionsBar}>
                    {isPublished ? (
                      <button
                        type="button"
                        disabled
                        aria-label={`Escala ${event.title} já publicada`}
                        className={`${styles.cardActionButton} ${styles.cardPublishedButton}`}
                      >
                        <SendIcon />
                        <span>Publicado</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={`${styles.cardActionButton} ${styles.cardPublishButton}`}
                        onClick={() =>
                          openConfirmModal({ type: "publish-one", event })
                        }
                      >
                        <SendIcon />
                        <span>Publicar</span>
                      </button>
                    )}

                    <button
                      type="button"
                      className={`${styles.cardActionButton} ${styles.cardEditButton}`}
                      onClick={() => openEditScheduleDrawer(event)}
                    >
                      <PencilIcon />
                      <span>Editar</span>
                    </button>

                    <button
                      type="button"
                      className={`${styles.cardActionButton} ${styles.cardDeleteButton}`}
                      onClick={() =>
                        openConfirmModal({ type: "delete", event })
                      }
                    >
                      <TrashIcon />
                      <span>Excluir</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>

      {/* Modal: Indicar ausência */}
      <dialog
        ref={absenceDialogRef}
        closedby="any"
        aria-labelledby={modalTitleId}
        className={styles.modalDialog}
        onClose={handleAbsenceDialogClose}
      >
        <form method="dialog" className={styles.modalForm}>
          <h2 id={modalTitleId} className={styles.modalTitle}>
            Não conseguirei participar
          </h2>
          <p className={styles.modalSubtitle}>
            Informe sua ausência para{" "}
            <strong>
              {nextUserSchedule?.title || NEXT_SCHEDULE.title} (
              {nextUserSchedule?.fullDateLabel || NEXT_SCHEDULE.fullDateLabel},{" "}
              {nextUserSchedule?.time || NEXT_SCHEDULE.time})
            </strong>
            . Se desejar, sugira alguém da equipe para cobrir sua função.
          </p>

          <div className={styles.modalField}>
            <label htmlFor={substituteSelectId} className={styles.modalLabel}>
              Indicar substituto (opcional)
            </label>
            <select
              id={substituteSelectId}
              value={suggestedSubstitute}
              className={styles.modalSelect}
              onChange={(event) =>
                setSuggestedSubstitute(event.currentTarget.value)
              }
            >
              <option value="">Sem indicação específica</option>
              {MINISTRY_TEAMMATES.map((mate) => (
                <option key={mate} value={mate}>
                  {mate}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.modalField}>
            <label htmlFor={reasonInputId} className={styles.modalLabel}>
              Observação (opcional)
            </label>
            <input
              id={reasonInputId}
              type="text"
              value={absenceReason}
              placeholder="Ex: Compromisso de trabalho nesse horário"
              maxLength={120}
              className={styles.modalInput}
              onChange={(event) => setAbsenceReason(event.currentTarget.value)}
            />
          </div>

          <div className={styles.modalActions}>
            <button
              type="submit"
              value="cancel"
              autoFocus
              className={styles.modalCancelButton}
            >
              Voltar
            </button>
            <button
              type="submit"
              value="confirm"
              className={styles.modalConfirmButton}
            >
              Confirmar ausência
            </button>
          </div>
        </form>
      </dialog>

      {/* Right-Side Drawer: Detalhes da substituição */}
      <dialog
        ref={substitutionDialogRef}
        aria-labelledby={substitutionTitleId}
        className={styles.substitutionDrawer}
        onCancel={(event) => {
          if (event.cancelable) {
            event.preventDefault();
            closeAnimatedDialog(substitutionDialogRef.current);
          }
        }}
      >
        <div className={styles.drawerHeader}>
          <div className={styles.drawerHeaderLead}>
            <span className={styles.substitutionIconWrap} aria-hidden="true">
              <SwapIcon />
            </span>
            <div>
              <p className={styles.drawerEyebrow}>AÇÃO NECESSÁRIA</p>
              <h2 id={substitutionTitleId} className={styles.drawerTitle}>
                Pedido de substituição
              </h2>
            </div>
          </div>

          <button
            type="button"
            aria-label="Fechar detalhes da substituição"
            autoFocus
            className={styles.drawerCloseButton}
            onClick={() => closeAnimatedDialog(substitutionDialogRef.current)}
          >
            <CloseIcon />
          </button>
        </div>

        <div className={styles.drawerBody}>
          <div className={styles.drawerSummaryCard}>
            <h3 className={styles.drawerSummaryTitle}>
              Você foi sugerido para uma substituição
            </h3>
            <p className={styles.drawerSummaryDesc}>
              <strong>{INITIAL_SUBSTITUTION_REQUEST.requesterHandle}</strong>{" "}
              não poderá participar e indicou você para assumir esta escala.
            </p>
          </div>

          <dl className={styles.drawerMetaList}>
            <div className={styles.drawerMetaItem}>
              <dt>MINISTÉRIO</dt>
              <dd>{INITIAL_SUBSTITUTION_REQUEST.ministryName}</dd>
            </div>
            <div className={styles.drawerMetaItem}>
              <dt>EVENTO</dt>
              <dd>{INITIAL_SUBSTITUTION_REQUEST.eventTitle}</dd>
            </div>
            <div className={styles.drawerMetaItem}>
              <dt>DATA E HORÁRIO</dt>
              <dd>{INITIAL_SUBSTITUTION_REQUEST.dateTimeLabel}</dd>
            </div>
            <div className={styles.drawerMetaItem}>
              <dt>FUNÇÃO SUGERIDA</dt>
              <dd>{INITIAL_SUBSTITUTION_REQUEST.suggestedRole}</dd>
            </div>
            <div className={styles.drawerMetaItem}>
              <dt>SUBSTITUINDO</dt>
              <dd>
                {INITIAL_SUBSTITUTION_REQUEST.requesterName}{" "}
                <span className={styles.metaHandle}>
                  {INITIAL_SUBSTITUTION_REQUEST.requesterHandle}
                </span>
              </dd>
            </div>
          </dl>
        </div>

        <div className={styles.drawerFooter}>
          <button
            type="button"
            className={styles.declineButton}
            onClick={() => handleSubstitutionDecision("declined")}
          >
            <CloseIcon />
            <span>Recusar</span>
          </button>
          <button
            type="button"
            className={styles.acceptButton}
            onClick={() => handleSubstitutionDecision("accepted")}
          >
            <CheckIcon />
            <span>Aceitar substituição</span>
          </button>
        </div>
      </dialog>

      {/* Right-Side Animated Drawer: Nova escala / Editar escala */}
      <dialog
        ref={scheduleDialogRef}
        aria-labelledby={scheduleDrawerTitleId}
        className={styles.scheduleDrawer}
        onCancel={(event) => {
          if (event.cancelable) {
            event.preventDefault();
            closeAnimatedDialog(scheduleDialogRef.current);
          }
        }}
      >
        <div className={styles.scheduleDrawerHeader}>
          <div>
            <p className={styles.scheduleDrawerEyebrow}>PLANEJAMENTO</p>
            <h2 id={scheduleDrawerTitleId} className={styles.scheduleDrawerTitle}>
              {isEditing
                ? "Editar escala"
                : scheduleMode === "recurring"
                  ? "Adicionar escalas"
                  : "Adicionar à escala"}
            </h2>
          </div>

          <button
            type="button"
            aria-label="Fechar formulário de escala"
            className={styles.drawerCloseButton}
            onClick={() => closeAnimatedDialog(scheduleDialogRef.current)}
          >
            <CloseIcon />
          </button>
        </div>

        <form
          className={styles.scheduleDrawerForm}
          noValidate
          onSubmit={handleScheduleSubmit}
        >
          <div className={styles.scheduleDrawerBody}>
            {!isEditing && (
              <div
                className={styles.modeSegmentGroup}
                role="group"
                aria-label="Tipo de agendamento"
              >
                <button
                  type="button"
                  aria-pressed={scheduleMode === "specific"}
                  className={`${styles.modeSegmentButton} ${
                    scheduleMode === "specific" ? styles.modeSegmentActive : ""
                  }`}
                  onClick={handleSwitchToSpecificMode}
                >
                  <CalendarIcon />
                  <span>Data específica</span>
                </button>
                <button
                  type="button"
                  aria-pressed={scheduleMode === "recurring"}
                  className={`${styles.modeSegmentButton} ${
                    scheduleMode === "recurring" ? styles.modeSegmentActive : ""
                  }`}
                  onClick={handleSwitchToRecurringMode}
                >
                  <SwapIcon />
                  <span>Evento recorrente</span>
                </button>
              </div>
            )}

            {isRecurringCreate ? (
              <>
                <div className={styles.drawerField}>
                  <label
                    htmlFor={recurringSelectId}
                    className={styles.drawerLabel}
                  >
                    Evento recorrente
                  </label>
                  {recurringEvents.length > 0 ? (
                    <>
                      <select
                        ref={recurringSelectRef}
                        id={recurringSelectId}
                        name="recurringTemplate"
                        value={selectedRecurringId}
                        required
                        aria-invalid={recurringError ? "true" : "false"}
                        aria-describedby={
                          recurringError ? recurringErrorId : undefined
                        }
                        className={`${styles.drawerSelect} ${
                          recurringError ? styles.drawerInputError : ""
                        }`}
                        onChange={(event) =>
                          applyRecurringSelection(event.currentTarget.value)
                        }
                      >
                        <option value="" disabled>
                          Selecione um evento recorrente...
                        </option>
                        {recurringEvents.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title} —{" "}
                            {formatWeekdayShortTitle(item.weekday)} às{" "}
                            {normalizeWallTime(item.time) || item.time}
                          </option>
                        ))}
                      </select>
                      {recurringError && (
                        <div
                          id={recurringErrorId}
                          className={styles.fieldErrorMsg}
                        >
                          <AlertCircleIcon className={styles.fieldErrorIcon} />
                          <span>{recurringError}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className={styles.recurringEmptyNote}>
                      Nenhum evento recorrente cadastrado. Cadastre modelos na
                      aba Eventos recorrentes para criar escalas em lote.
                    </p>
                  )}
                </div>

                {selectedRecurringEvent && (
                  <div className={styles.recurringPreviewCard}>
                    <p className={styles.recurringPreviewKicker}>
                      {selectedDrawerMinistry.name}
                    </p>
                    <h3 className={styles.recurringPreviewTitle}>
                      {selectedRecurringEvent.title}
                    </h3>
                    <p className={styles.recurringPreviewDesc}>
                      {recurringOccurrences.length === 1
                        ? `A ocorrência restante de ${recurringMonthYearLabel} (a partir de hoje) será criada como rascunho.`
                        : recurringOccurrences.length > 1
                          ? `As ${recurringOccurrences.length} ocorrências restantes de ${recurringMonthYearLabel} (a partir de hoje) serão criadas como rascunho.`
                          : `Não há mais ocorrências em ${recurringMonthYearLabel} a partir de hoje.`}
                    </p>
                    {recurringOccurrences.length > 0 && (
                      <ul
                        className={styles.recurringDatesList}
                        aria-label="Datas que serão criadas"
                      >
                        {recurringOccurrences.map((iso) => (
                          <li key={iso} className={styles.recurringDateChip}>
                            {formatRecurringChipDate(iso)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className={styles.drawerField}>
                  <label
                    htmlFor={drawerTitleInputId}
                    className={styles.drawerLabel}
                  >
                    Nome do evento
                  </label>
                  <input
                    ref={titleInputRef}
                    id={drawerTitleInputId}
                    name="title"
                    type="text"
                    value={formTitle}
                    placeholder="Ex.: Culto de Celebração"
                    required
                    minLength={2}
                    maxLength={90}
                    aria-invalid={fieldErrors.title ? "true" : "false"}
                    aria-describedby={
                      fieldErrors.title ? drawerTitleErrorId : undefined
                    }
                    className={`${styles.drawerInput} ${
                      fieldErrors.title ? styles.drawerInputError : ""
                    }`}
                    onChange={(event) => {
                      const val = event.currentTarget.value;
                      setFormTitle(val);
                      setDirtyFields((prev) => ({ ...prev, title: true }));
                      if (fieldErrors.title) {
                        setFieldErrors((prev) => ({ ...prev, title: "" }));
                      }
                    }}
                    onBlur={() => handleFieldBlur("title")}
                  />
                  {fieldErrors.title && (
                    <div
                      id={drawerTitleErrorId}
                      className={styles.fieldErrorMsg}
                    >
                      <AlertCircleIcon className={styles.fieldErrorIcon} />
                      <span>{fieldErrors.title}</span>
                    </div>
                  )}
                </div>

                <div className={styles.drawerTwoCol}>
                  <div className={styles.drawerField}>
                    <label
                      htmlFor={drawerDateInputId}
                      className={styles.drawerLabel}
                    >
                      Data
                    </label>
                    <input
                      ref={dateInputRef}
                      id={drawerDateInputId}
                      name="dateIso"
                      type="date"
                      value={formDateIso}
                      required
                      aria-invalid={fieldErrors.dateIso ? "true" : "false"}
                      aria-describedby={
                        fieldErrors.dateIso ? drawerDateErrorId : undefined
                      }
                      className={`${styles.drawerInput} ${
                        fieldErrors.dateIso ? styles.drawerInputError : ""
                      }`}
                      onChange={(event) => {
                        setFormDateIso(event.currentTarget.value);
                        setDirtyFields((prev) => ({ ...prev, dateIso: true }));
                        if (fieldErrors.dateIso) {
                          setFieldErrors((prev) => ({ ...prev, dateIso: "" }));
                        }
                      }}
                      onBlur={() => handleFieldBlur("dateIso")}
                    />
                    {fieldErrors.dateIso && (
                      <div
                        id={drawerDateErrorId}
                        className={styles.fieldErrorMsg}
                      >
                        <AlertCircleIcon className={styles.fieldErrorIcon} />
                        <span>{fieldErrors.dateIso}</span>
                      </div>
                    )}
                  </div>

                  <div className={styles.drawerField}>
                    <label
                      htmlFor={drawerTimeInputId}
                      className={styles.drawerLabel}
                    >
                      Horário
                    </label>
                    <input
                      ref={timeInputRef}
                      id={drawerTimeInputId}
                      name="time"
                      type="time"
                      value={formTime}
                      required
                      aria-invalid={fieldErrors.time ? "true" : "false"}
                      aria-describedby={
                        fieldErrors.time ? drawerTimeErrorId : undefined
                      }
                      className={`${styles.drawerInput} ${
                        fieldErrors.time ? styles.drawerInputError : ""
                      }`}
                      onChange={(event) => {
                        setFormTime(event.currentTarget.value);
                        setDirtyFields((prev) => ({ ...prev, time: true }));
                        if (fieldErrors.time) {
                          setFieldErrors((prev) => ({ ...prev, time: "" }));
                        }
                      }}
                      onBlur={() => handleFieldBlur("time")}
                    />
                    {fieldErrors.time && (
                      <div
                        id={drawerTimeErrorId}
                        className={styles.fieldErrorMsg}
                      >
                        <AlertCircleIcon className={styles.fieldErrorIcon} />
                        <span>{fieldErrors.time}</span>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className={styles.drawerField}>
              <label
                htmlFor={drawerMinistrySelectId}
                className={styles.drawerLabel}
              >
                Ministério
              </label>
              <select
                id={drawerMinistrySelectId}
                name="ministryId"
                value={formMinistryId}
                className={styles.drawerSelect}
                onChange={(event) =>
                  setFormMinistryId(event.currentTarget.value)
                }
              >
                {availableMinistries.map((ministry) => (
                  <option key={ministry.id} value={ministry.id}>
                    {ministry.name}
                  </option>
                ))}
              </select>
            </div>

            {!isRecurringCreate && (
              <fieldset className={styles.memberFieldset}>
                <legend className={styles.drawerLabel}>
                  Membro(s) escalado(s)
                </legend>

                <div className={styles.memberSelectorGrid}>
                  {visibleMembers.map((member) => {
                    const isSelected = selectedMemberIds.includes(member.id);

                    return (
                      <label
                        key={member.id}
                        className={`${styles.memberCard} ${
                          isSelected ? styles.memberCardSelected : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          name="selectedMembers"
                          value={member.id}
                          checked={isSelected}
                          className="visually-hidden"
                          onChange={() => handleToggleMember(member)}
                        />
                        <span
                          className={styles.memberCardAvatar}
                          aria-hidden="true"
                        >
                          {member.initials}
                        </span>
                        <span className={styles.memberCardText}>
                          <span className={styles.memberCardName}>
                            {member.name}
                          </span>
                          <span className={styles.memberCardHandle}>
                            {member.handle}
                          </span>
                        </span>
                        {isSelected && (
                          <span
                            className={styles.memberCardCheck}
                            aria-hidden="true"
                          >
                            <CheckIcon />
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <div className={styles.drawerField}>
              <label
                htmlFor={drawerDetailsInputId}
                className={styles.drawerLabel}
              >
                Detalhes opcionais
              </label>
              <textarea
                id={drawerDetailsInputId}
                name="details"
                rows={3}
                value={formDetails}
                maxLength={240}
                placeholder="Orientações técnicas, horário de chegada..."
                className={styles.drawerTextarea}
                onChange={(event) => setFormDetails(event.currentTarget.value)}
              />
            </div>
          </div>

          <div className={styles.scheduleDrawerFooter}>
            <button
              type="button"
              className={styles.drawerCancelButton}
              onClick={() => closeAnimatedDialog(scheduleDialogRef.current)}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={
                isRecurringCreate &&
                (!selectedRecurringEvent || recurringOccurrences.length === 0)
              }
              className={styles.drawerSubmitButton}
            >
              {isEditing ? <CheckIcon /> : <PlusIcon />}
              <span>
                {isEditing
                  ? "Salvar alterações"
                  : isRecurringCreate
                    ? recurringOccurrences.length > 0
                      ? `Criar ${recurringOccurrences.length} ${recurringOccurrences.length === 1 ? "rascunho" : "rascunhos"}`
                      : "Criar rascunhos"
                    : "Salvar rascunho"}
              </span>
            </button>
          </div>
        </form>
      </dialog>

      {/* Irreversible Action Confirmation Modal */}
      <dialog
        ref={confirmDialogRef}
        closedby="any"
        aria-labelledby={confirmModalTitleId}
        className={styles.confirmDialog}
        onClose={handleConfirmDialogClose}
      >
        <form method="dialog" className={styles.confirmForm}>
          <div className={styles.confirmHeader}>
            <div>
              <p className={styles.confirmEyebrow}>CONFIRMAÇÃO NECESSÁRIA</p>
              <h2 id={confirmModalTitleId} className={styles.confirmTitle}>
                {confirmModal?.type === "delete"
                  ? "Excluir escala?"
                  : confirmModal?.type === "publish-all"
                    ? "Publicar todas as escalas?"
                    : "Publicar escala?"}
              </h2>
            </div>

            <button
              type="submit"
              value="cancel"
              aria-label="Fechar confirmação"
              className={styles.confirmCloseBtn}
            >
              <CloseIcon />
            </button>
          </div>

          <div className={styles.confirmBody}>
            <div
              className={`${styles.confirmCallout} ${
                confirmModal?.type === "delete"
                  ? styles.confirmCalloutDanger
                  : styles.confirmCalloutWarning
              }`}
            >
              <span
                className={`${styles.confirmBadge} ${
                  confirmModal?.type === "delete"
                    ? styles.confirmBadgeDanger
                    : styles.confirmBadgeWarning
                }`}
                aria-hidden="true"
              >
                <AlertTriangleIcon />
              </span>

              <div>
                <h3 className={styles.confirmCalloutTitle}>
                  Revise antes de continuar
                </h3>
                <p className={styles.confirmCalloutDesc}>
                  {confirmModal?.type === "delete" && confirmModal.event && (
                    <>
                      A escala <strong>{confirmModal.event.title}</strong> será
                      removida definitivamente, incluindo os membros vinculados a
                      ela. Esta ação não poderá ser desfeita.
                    </>
                  )}
                  {confirmModal?.type === "publish-one" &&
                    confirmModal.event && (
                      <>
                        A escala <strong>{confirmModal.event.title}</strong> (
                        {confirmModal.event.day} {confirmModal.event.monthShort},{" "}
                        {confirmModal.event.time}) será publicada para a equipe e
                        ficará visível para os participantes escalados. Esta
                        ação não poderá ser desfeita.
                      </>
                    )}
                  {confirmModal?.type === "publish-all" && (
                    <>
                      Todas as{" "}
                      <strong>
                        {confirmModal.count} escala(s) em rascunho
                      </strong>{" "}
                      serão publicadas definitivamente para a equipe. Esta ação
                      não poderá ser desfeita.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div className={styles.confirmFooter}>
            <button
              ref={confirmCancelBtnRef}
              type="submit"
              value="cancel"
              autoFocus
              className={styles.confirmCancelBtn}
            >
              Cancelar
            </button>

            <button
              type="submit"
              value="confirm"
              className={
                confirmModal?.type === "delete"
                  ? styles.confirmDangerBtn
                  : styles.confirmPrimaryBtn
              }
            >
              {confirmModal?.type === "delete"
                ? "Excluir escala"
                : confirmModal?.type === "publish-all"
                  ? "Publicar todas"
                  : "Publicar escala"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
