"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { usePrivateWorkspace } from "@/components/layout/PrivateWorkspaceContext";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  CalendarIcon,
  CheckIcon,
  CloseIcon,
  PlusIcon,
  SwapIcon,
} from "@/components/ui/icons";
import { applyRecurringEvent } from "@/features/recurring-events/services/recurringEventsService";
import {
  assignCredentialToSchedule,
  createSchedule,
  getAvailableCredentials,
  getScheduleWindow,
  unassignCredentialFromSchedule,
  updateSchedule,
} from "@/features/schedules/services/schedulesService";
import {
  APP_TIME_ZONE,
  buildIsoDateTimeInZone,
  extractDateAndTimeInZone,
  formatIsoDatePtBr,
  formatYearMonthFullPt,
  getMonthsOfWindow,
  getTodayIsoInZone,
  getWindowRecurringOccurrences,
  isScheduleAtInsideWindow,
  normalizeWallTime,
  parseIsoDateParts,
} from "@/features/schedules/utils/scheduleDates";
import {
  clearRightDrawerAttrs,
  closeAnimatedRightDrawer,
  openRightDrawer,
  setupRightDrawerOutsideCollapse,
  shouldIgnoreRightDrawerClose,
} from "@/lib/rightDrawer";
import {
  canAssignMemberToSchedule,
  computeInitials,
  CREDENTIAL_STATUS,
  getAssignableDepartments,
  getDepartmentIds,
  isAdmin,
} from "@/lib/roles";
import styles from "./MonthlyScheduleView.module.css";

function validateTitleValue(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "Informe o nome do evento.";
  }
  if (trimmed.length < 2) {
    return "Digite pelo menos 2 caracteres para o nome do evento.";
  }
  if (trimmed.length > 80) {
    return "O nome do evento pode ter no máximo 80 caracteres.";
  }
  return "";
}

function validateDateIsoValue(value, todayIso, scheduleWindow) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "Informe uma data válida para a escala.";
  }
  if (!parseIsoDateParts(trimmed)) {
    return "Data inválida. Escolha uma data válida no calendário.";
  }
  if (todayIso && trimmed < todayIso) {
    return `Não é permitido criar ou editar escalas no passado (antes de ${formatIsoDatePtBr(todayIso)}).`;
  }
  if (
    scheduleWindow?.lastEditableDay &&
    trimmed > scheduleWindow.lastEditableDay
  ) {
    return `Data fora do período liberado. O limite atual é ${formatIsoDatePtBr(scheduleWindow.lastEditableDay)}.`;
  }
  return "";
}

function validateTimeValue(value) {
  if (!normalizeWallTime(value)) {
    return "Informe um horário válido no formato HH:mm.";
  }
  return "";
}

function validateVolunteersNeededValue(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "Informe quantas pessoas podem se inscrever nesta escala.";
  }
  const num = Number(trimmed);
  if (!Number.isInteger(num) || num < 1 || num > 100) {
    return "Informe um número inteiro entre 1 e 100 pessoas.";
  }
  return "";
}

const ASSIGNMENT_WARNING_LABELS = {
  NO_WEEKLY_AVAILABILITY: "sem disponibilidade semanal marcada",
  UNAVAILABLE: "com ausência registrada no horário",
  OVER_CAPACITY: "acima da capacidade informada",
};

export function ScheduleFormDrawer({
  mode = "create",
  event = null,
  scheduleWindow: initialScheduleWindow = null,
  onClose,
}) {
  const {
    activeMinistry,
    departments,
    participants,
    currentUser,
    recurringEvents,
    notifySchedulesChanged,
  } = usePrivateWorkspace();
  const toast = useToast();

  const isEditing = mode === "edit" && Boolean(event);
  const userIsAdmin = isAdmin(currentUser);
  const userDepartmentIds = useMemo(
    () => getDepartmentIds(currentUser),
    [currentUser]
  );
  const assignableDepartments = useMemo(
    () => getAssignableDepartments(currentUser, departments),
    [currentUser, departments]
  );
  const activeMinistryId =
    activeMinistry?.id && !activeMinistry.isGlobal
      ? activeMinistry.id
      : userDepartmentIds[0] || "";
  const activeDepartment = useMemo(() => {
    if (userIsAdmin) return null;
    return (
      assignableDepartments.find((dept) => dept.id === activeMinistryId) ||
      assignableDepartments[0] ||
      null
    );
  }, [activeMinistryId, assignableDepartments, userIsAdmin]);

  const drawerTitleId = useId();
  const recurringSelectId = useId();
  const recurringErrorId = useId();
  const recurringMonthSelectId = useId();
  const recurringMinistrySelectId = useId();
  const drawerTitleInputId = useId();
  const drawerTitleErrorId = useId();
  const drawerDateInputId = useId();
  const drawerDateErrorId = useId();
  const drawerTimeInputId = useId();
  const drawerTimeErrorId = useId();
  const drawerMinistrySelectId = useId();
  const selfSignupSwitchId = useId();
  const volunteersNeededInputId = useId();
  const volunteersNeededErrorId = useId();
  const drawerDetailsInputId = useId();

  const dialogRef = useRef(null);
  const recurringSelectRef = useRef(null);
  const titleInputRef = useRef(null);
  const dateInputRef = useRef(null);
  const timeInputRef = useRef(null);
  const volunteersNeededInputRef = useRef(null);
  const announceTimerRef = useRef(null);
  const isCleaningUpRef = useRef(false);

  const [scheduleWindow, setScheduleWindow] = useState(initialScheduleWindow);
  const [scheduleMode, setScheduleMode] = useState("specific");
  const [selectedRecurringId, setSelectedRecurringId] = useState("");
  const [recurringMonth, setRecurringMonth] = useState(() =>
    (initialScheduleWindow?.editableFrom
      ? extractDateAndTimeInZone(
          initialScheduleWindow.editableFrom,
          APP_TIME_ZONE
        ).dateIso
      : getTodayIsoInZone(APP_TIME_ZONE)
    ).slice(0, 7)
  );
  const [recurringTargetDeptId, setRecurringTargetDeptId] = useState("all");
  const [recurringError, setRecurringError] = useState("");

  const [formTitle, setFormTitle] = useState(() =>
    isEditing ? event.title || "" : ""
  );
  const [formDateIso, setFormDateIso] = useState(() =>
    isEditing ? event.dateIso || "" : ""
  );
  const [formTime, setFormTime] = useState(() =>
    isEditing ? event.time || "19:00" : "19:00"
  );
  const [formMinistryId, setFormMinistryId] = useState(() => {
    if (isEditing) {
      return event.ministryId || "";
    }
    const assignable = getAssignableDepartments(currentUser, departments);
    const activeId =
      activeMinistry?.id && !activeMinistry.isGlobal
        ? activeMinistry.id
        : getDepartmentIds(currentUser)[0] || "";
    return activeId && assignable.some((dept) => dept.id === activeId)
      ? activeId
      : assignable[0]?.id || "";
  });
  const [formSelfSignup, setFormSelfSignup] = useState(() =>
    isEditing ? Boolean(event.selfSignup) : false
  );
  const [formVolunteersNeeded, setFormVolunteersNeeded] = useState(() =>
    isEditing && event.volunteersNeeded ? String(event.volunteersNeeded) : "4"
  );
  const [selectedMemberIds, setSelectedMemberIds] = useState(() =>
    isEditing ? (event.assignments || []).map((person) => person.memberId) : []
  );
  const [formDetails, setFormDetails] = useState(() =>
    isEditing ? event.details || "" : ""
  );
  const [availableMemberMeta, setAvailableMemberMeta] = useState({});
  const [isLoadingAvailableMembers, setIsLoadingAvailableMembers] = useState(
    () => Boolean(isEditing && event?.id)
  );

  const [dirtyFields, setDirtyFields] = useState({
    title: false,
    dateIso: false,
    time: false,
    volunteersNeeded: false,
  });
  const [fieldErrors, setFieldErrors] = useState({
    title: "",
    dateIso: "",
    time: "",
    volunteersNeeded: "",
  });
  const [drawerFormError, setDrawerFormError] = useState("");
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
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
    if (initialScheduleWindow) return undefined;
    let active = true;
    getScheduleWindow().then((res) => {
      if (!active || !res.ok || !res.data) return;
      setScheduleWindow(res.data);
    });
    return () => {
      active = false;
    };
  }, [initialScheduleWindow]);

  useEffect(() => {
    if (!isEditing || !event?.id) return undefined;
    let active = true;
    getAvailableCredentials(event.id).then((res) => {
      if (!active) return;
      setIsLoadingAvailableMembers(false);
      if (res.ok && Array.isArray(res.data)) {
        const nextMap = {};
        for (const item of res.data) {
          if (item?.credential?.id) {
            nextMap[item.credential.id] = item;
          }
        }
        setAvailableMemberMeta(nextMap);
      }
    });
    return () => {
      active = false;
    };
  }, [isEditing, event?.id]);

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
      canCollapse: () => !isSavingSchedule,
    });
  }, [isSavingSchedule]);

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

  const todayIso = useMemo(() => {
    if (scheduleWindow?.editableFrom) {
      return extractDateAndTimeInZone(
        scheduleWindow.editableFrom,
        APP_TIME_ZONE
      ).dateIso;
    }
    return getTodayIsoInZone(APP_TIME_ZONE);
  }, [scheduleWindow]);

  const isRecurringCreate = !isEditing && scheduleMode === "recurring";

  const selectableRecurringEvents = useMemo(() => {
    if (!recurringEvents.length) return [];
    if (userIsAdmin) return recurringEvents;
    const targetDeptId = activeDepartment?.id || "";
    if (!targetDeptId) return [];
    return recurringEvents.filter((item) => {
      if (item.isGeneral) return true;
      const eventDeptIds =
        Array.isArray(item.departmentIds) && item.departmentIds.length > 0
          ? item.departmentIds
          : item.departmentId
            ? [item.departmentId]
            : [];
      return eventDeptIds.includes(targetDeptId);
    });
  }, [activeDepartment?.id, recurringEvents, userIsAdmin]);

  const selectedRecurringEvent = useMemo(
    () =>
      selectableRecurringEvents.find(
        (item) => item.id === selectedRecurringId
      ) || null,
    [selectableRecurringEvents, selectedRecurringId]
  );

  const availableRecurringDepartments = useMemo(() => {
    if (!selectedRecurringEvent) return [];
    if (!userIsAdmin) {
      if (!activeDepartment) return [];
      if (selectedRecurringEvent.isGeneral) return [activeDepartment];
      const scopedIds =
        Array.isArray(selectedRecurringEvent.departmentIds) &&
        selectedRecurringEvent.departmentIds.length > 0
          ? selectedRecurringEvent.departmentIds
          : selectedRecurringEvent.departmentId
            ? [selectedRecurringEvent.departmentId]
            : [];
      return scopedIds.includes(activeDepartment.id)
        ? [activeDepartment]
        : [];
    }
    if (selectedRecurringEvent.isGeneral) return assignableDepartments;
    const scopedIds =
      Array.isArray(selectedRecurringEvent.departmentIds) &&
      selectedRecurringEvent.departmentIds.length > 0
        ? selectedRecurringEvent.departmentIds
        : selectedRecurringEvent.departmentId
          ? [selectedRecurringEvent.departmentId]
          : [];
    return assignableDepartments.filter((dept) => scopedIds.includes(dept.id));
  }, [
    activeDepartment,
    assignableDepartments,
    selectedRecurringEvent,
    userIsAdmin,
  ]);

  const isRecurringMinistryLocked = !userIsAdmin;
  const isSpecificMinistryLocked = isEditing || !userIsAdmin;
  const effectiveFormMinistryId =
    !isEditing && !userIsAdmin ? activeDepartment?.id || "" : formMinistryId;

  const windowMonthOptions = useMemo(() => {
    if (scheduleWindow?.editableFrom && scheduleWindow?.lastEditableDay) {
      return getMonthsOfWindow(
        scheduleWindow.editableFrom,
        scheduleWindow.lastEditableDay
      );
    }
    return [todayIso.slice(0, 7)];
  }, [scheduleWindow, todayIso]);

  const recurringPreview = useMemo(() => {
    if (!selectedRecurringEvent) {
      return { slots: [], byDate: [], totalSlots: 0, outsideWindowCount: 0 };
    }
    const times =
      Array.isArray(selectedRecurringEvent.times) &&
      selectedRecurringEvent.times.length > 0
        ? selectedRecurringEvent.times
        : selectedRecurringEvent.time
          ? [selectedRecurringEvent.time]
          : [];

    return getWindowRecurringOccurrences({
      weekday:
        selectedRecurringEvent.weekdayCode || selectedRecurringEvent.weekday,
      times,
      month: recurringMonth || undefined,
      scheduleWindow,
      timeZone: APP_TIME_ZONE,
    });
  }, [recurringMonth, scheduleWindow, selectedRecurringEvent]);

  const recurringTargetMultiplier = useMemo(() => {
    if (!selectedRecurringEvent) return 1;
    if (isRecurringMinistryLocked) return 1;
    if (recurringTargetDeptId === "all") {
      return Math.max(1, availableRecurringDepartments.length);
    }
    return 1;
  }, [
    availableRecurringDepartments.length,
    isRecurringMinistryLocked,
    recurringTargetDeptId,
    selectedRecurringEvent,
  ]);

  const recurringTotalDrafts =
    recurringPreview.totalSlots * recurringTargetMultiplier;

  const roleByMemberId = useMemo(() => {
    const map = new Map();
    for (const person of participants) {
      if (person?.id && person.roleCode) {
        map.set(person.id, person.roleCode);
      }
    }
    for (const [credId, info] of Object.entries(availableMemberMeta)) {
      if (info?.credential?.role) {
        map.set(credId, info.credential.role);
      }
    }
    if (isEditing && event) {
      for (const asg of event.assignments || []) {
        if (asg?.memberId && asg.roleCode && !map.has(asg.memberId)) {
          map.set(asg.memberId, asg.roleCode);
        }
      }
    }
    return map;
  }, [availableMemberMeta, event, isEditing, participants]);

  const visibleMembers = useMemo(() => {
    if (!effectiveFormMinistryId) return [];

    const activeInDept = participants.filter(
      (member) =>
        member.status !== CREDENTIAL_STATUS.INACTIVE &&
        member.departmentIds?.includes(effectiveFormMinistryId) &&
        canAssignMemberToSchedule(currentUser, member)
    );

    const byId = new Map();
    for (const person of activeInDept) {
      byId.set(person.id, {
        id: person.id,
        initials: person.initials || computeInitials(person.name),
        name: person.name,
        handle: person.handle || "",
        availability: availableMemberMeta[person.id] || null,
      });
    }

    for (const [credId, info] of Object.entries(availableMemberMeta)) {
      const candidateRole =
        info?.credential?.role || roleByMemberId.get(credId) || "";
      if (
        !byId.has(credId) &&
        info?.credential &&
        canAssignMemberToSchedule(currentUser, { role: candidateRole })
      ) {
        byId.set(credId, {
          id: credId,
          initials: computeInitials(info.credential.name),
          name: info.credential.name,
          handle: info.credential.username
            ? `@${info.credential.username}`
            : "",
          availability: info,
        });
      }
    }

    if (isEditing && event) {
      for (const asg of event.assignments || []) {
        const assigneeRole =
          asg.roleCode || roleByMemberId.get(asg.memberId) || "";
        if (
          !byId.has(asg.memberId) &&
          canAssignMemberToSchedule(currentUser, { role: assigneeRole })
        ) {
          byId.set(asg.memberId, {
            id: asg.memberId,
            initials: asg.initials,
            name: asg.name,
            handle: asg.handle || "",
            availability: availableMemberMeta[asg.memberId] || null,
          });
        }
      }
    }

    return [...byId.values()].sort((a, b) => {
      const aAvail = a.availability?.available ? 1 : 0;
      const bAvail = b.availability?.available ? 1 : 0;
      if (aAvail !== bAvail) return bAvail - aAvail;
      return a.name.localeCompare(b.name, "pt-BR");
    });
  }, [
    availableMemberMeta,
    currentUser,
    effectiveFormMinistryId,
    event,
    isEditing,
    participants,
    roleByMemberId,
  ]);

  const resetScheduleFormValidation = () => {
    setDirtyFields({
      title: false,
      dateIso: false,
      time: false,
      volunteersNeeded: false,
    });
    setFieldErrors({
      title: "",
      dateIso: "",
      time: "",
      volunteersNeeded: "",
    });
    setRecurringError("");
    setDrawerFormError("");
  };

  const applyRecurringSelection = (recurringId) => {
    setSelectedRecurringId(recurringId);
    setRecurringError("");
    setDrawerFormError("");

    const template = selectableRecurringEvents.find(
      (item) => item.id === recurringId
    );
    if (!template) return;

    if (!userIsAdmin) {
      setRecurringTargetDeptId(activeDepartment?.id || "");
    } else {
      setRecurringTargetDeptId("all");
    }
  };

  const handleSwitchToRecurringMode = () => {
    setScheduleMode("recurring");
    setRecurringMonth(windowMonthOptions[0] || todayIso.slice(0, 7));
    resetScheduleFormValidation();

    if (selectableRecurringEvents.length > 0) {
      const currentMatch = selectableRecurringEvents.find(
        (item) => item.id === selectedRecurringId
      );
      if (currentMatch) {
        applyRecurringSelection(currentMatch.id);
      } else {
        const defaultTemplate =
          selectableRecurringEvents.find(
            (item) =>
              item.departmentId === activeMinistryId ||
              item.departmentIds?.includes(activeMinistryId)
          ) || selectableRecurringEvents[0];
        applyRecurringSelection(defaultTemplate.id);
      }
    }
  };

  const handleSwitchToSpecificMode = () => {
    setScheduleMode("specific");
    resetScheduleFormValidation();
  };

  const handleToggleMember = (member) => {
    setSelectedMemberIds((prev) =>
      prev.includes(member.id)
        ? prev.filter((id) => id !== member.id)
        : [...prev, member.id]
    );
  };

  const handleFieldBlur = (field) => {
    if (!dirtyFields[field]) return;

    let errorMessage = "";
    if (field === "title") {
      errorMessage = validateTitleValue(formTitle);
    } else if (field === "dateIso") {
      errorMessage = validateDateIsoValue(
        formDateIso,
        todayIso,
        scheduleWindow
      );
    } else if (field === "time") {
      errorMessage = validateTimeValue(formTime);
    } else if (field === "volunteersNeeded" && formSelfSignup) {
      errorMessage = validateVolunteersNeededValue(formVolunteersNeeded);
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
    if (isSavingSchedule) return;

    setDrawerFormError("");

    if (isRecurringCreate) {
      if (!selectedRecurringEvent) {
        const msg = "Selecione um evento recorrente.";
        setRecurringError(msg);
        announce(msg);
        recurringSelectRef.current?.focus();
        return;
      }

      if (recurringPreview.totalSlots === 0) {
        const msg =
          "Não há ocorrências válidas dentro do período liberado para este mês/evento.";
        setRecurringError(msg);
        announce(msg);
        recurringSelectRef.current?.focus();
        return;
      }

      if (availableRecurringDepartments.length === 0) {
        const msg =
          "Não há ministérios disponíveis sob sua gestão para este evento recorrente.";
        setRecurringError(msg);
        announce(msg);
        return;
      }

      if (formSelfSignup) {
        const nextVolError = validateVolunteersNeededValue(
          formVolunteersNeeded
        );
        setDirtyFields((prev) => ({ ...prev, volunteersNeeded: true }));
        setFieldErrors((prev) => ({ ...prev, volunteersNeeded: nextVolError }));
        if (nextVolError) {
          announce(nextVolError);
          volunteersNeededInputRef.current?.focus();
          return;
        }
      }

      const lockedRecurringDeptId = isRecurringMinistryLocked
        ? availableRecurringDepartments[0]?.id || ""
        : "";
      const targetRecurringDeptIds = isRecurringMinistryLocked
        ? lockedRecurringDeptId
          ? [lockedRecurringDeptId]
          : []
        : recurringTargetDeptId && recurringTargetDeptId !== "all"
          ? [recurringTargetDeptId]
          : null;

      const applyPayload = {
        ...(recurringMonth ? { month: recurringMonth } : {}),
        ...(targetRecurringDeptIds && targetRecurringDeptIds.length > 0
          ? { departmentIds: targetRecurringDeptIds }
          : {}),
        selfSignup: Boolean(formSelfSignup),
        ...(formSelfSignup
          ? { volunteersNeeded: Number(formVolunteersNeeded) }
          : {}),
      };

      setIsSavingSchedule(true);
      const res = await applyRecurringEvent(
        selectedRecurringEvent.id,
        applyPayload
      );
      setIsSavingSchedule(false);

      if (!res.ok || !res.data) {
        const msg =
          res.error ||
          "Não foi possível gerar escalas a partir do evento recorrente.";
        setDrawerFormError(msg);
        announce(msg);
        return;
      }

      notifySchedulesChanged();
      await closeAnimatedRightDrawer(dialogRef.current);

      const { created = 0, skipped = 0, outsideWindow = 0 } = res.data;
      if (created === 0) {
        toast.success(
          `Nenhuma escala nova criada (${skipped} já existia(m)${
            outsideWindow > 0 ? `, ${outsideWindow} fora do período` : ""
          }).`
        );
      } else {
        const extra = [];
        if (skipped > 0) extra.push(`${skipped} já existente(s)`);
        if (outsideWindow > 0) extra.push(`${outsideWindow} fora do limite`);
        toast.success(
          `${created} ${created === 1 ? "escala criada" : "escalas criadas"} como rascunho para "${selectedRecurringEvent.name}"${
            extra.length > 0 ? ` (${extra.join(", ")})` : ""
          }.`
        );
      }
      return;
    }

    const nextTitleError = validateTitleValue(formTitle);
    const nextDateError = validateDateIsoValue(
      formDateIso,
      todayIso,
      scheduleWindow
    );
    const nextTimeError = validateTimeValue(formTime);
    const nextVolError = formSelfSignup
      ? validateVolunteersNeededValue(formVolunteersNeeded)
      : "";

    setDirtyFields({
      title: true,
      dateIso: true,
      time: true,
      volunteersNeeded: true,
    });
    setFieldErrors({
      title: nextTitleError,
      dateIso: nextDateError,
      time: nextTimeError,
      volunteersNeeded: nextVolError,
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

    const scheduleAt = buildIsoDateTimeInZone(
      formDateIso,
      formTime,
      APP_TIME_ZONE
    );
    if (!scheduleAt) {
      const msg = "Não foi possível montar a data e o horário informados.";
      setFieldErrors((prev) => ({ ...prev, dateIso: msg }));
      dateInputRef.current?.focus();
      return;
    }

    if (
      scheduleWindow &&
      !isScheduleAtInsideWindow(scheduleAt, scheduleWindow)
    ) {
      const msg = `Horário fora do período liberado: escolha entre agora e ${formatIsoDatePtBr(scheduleWindow.lastEditableDay)}.`;
      setFieldErrors((prev) => ({ ...prev, dateIso: msg }));
      announce(msg);
      dateInputRef.current?.focus();
      return;
    }

    if (nextVolError) {
      announce(nextVolError);
      volunteersNeededInputRef.current?.focus();
      return;
    }

    const trimmedTitle = formTitle.trim();
    const trimmedDetails = formDetails.trim();
    const existingEvent = isEditing ? event : null;

    if (existingEvent) {
      const patch = {};
      if (trimmedTitle !== existingEvent.title) {
        patch.name = trimmedTitle;
      }

      const prevScheduleTime = buildIsoDateTimeInZone(
        existingEvent.dateIso,
        existingEvent.time,
        APP_TIME_ZONE
      );
      if (scheduleAt !== prevScheduleTime) {
        patch.scheduleAt = scheduleAt;
      }

      if (trimmedDetails !== (existingEvent.details || "").trim()) {
        patch.description = trimmedDetails || null;
      }

      if (formSelfSignup !== Boolean(existingEvent.selfSignup)) {
        patch.selfSignup = formSelfSignup;
        patch.volunteersNeeded = formSelfSignup
          ? Number(formVolunteersNeeded)
          : null;
      } else if (
        formSelfSignup &&
        Number(formVolunteersNeeded) !== existingEvent.volunteersNeeded
      ) {
        patch.volunteersNeeded = Number(formVolunteersNeeded);
      }

      setIsSavingSchedule(true);

      if (Object.keys(patch).length > 0) {
        const updateRes = await updateSchedule(existingEvent.id, patch);
        if (!updateRes.ok) {
          setIsSavingSchedule(false);
          const msg =
            updateRes.error ||
            "Não foi possível salvar as alterações da escala.";
          setDrawerFormError(msg);
          announce(msg);
          return;
        }
      }

      const collectedWarnings = [];
      let assignmentError = "";

      if (!formSelfSignup) {
        const currentIds = new Set(
          (existingEvent.assignments || []).map((a) => a.memberId)
        );
        const targetIds = new Set(selectedMemberIds);
        const toAdd = selectedMemberIds.filter(
          (id) =>
            !currentIds.has(id) &&
            canAssignMemberToSchedule(currentUser, {
              role: roleByMemberId.get(id),
            })
        );
        const toRemove = [...currentIds].filter(
          (id) =>
            !targetIds.has(id) &&
            canAssignMemberToSchedule(currentUser, {
              role: roleByMemberId.get(id),
            })
        );

        const ops = [
          ...toAdd.map((credentialId) =>
            assignCredentialToSchedule(existingEvent.id, credentialId)
          ),
          ...toRemove.map((credentialId) =>
            unassignCredentialFromSchedule(existingEvent.id, credentialId)
          ),
        ];

        if (ops.length > 0) {
          const results = await Promise.all(ops);
          for (const res of results) {
            if (!res.ok && !assignmentError) {
              assignmentError =
                res.error || "Falha ao atualizar membros da escala.";
            } else if (res.ok && Array.isArray(res.data?.warnings)) {
              for (const w of res.data.warnings) {
                if (ASSIGNMENT_WARNING_LABELS[w]) {
                  collectedWarnings.push(ASSIGNMENT_WARNING_LABELS[w]);
                }
              }
            }
          }
        }
      }

      setIsSavingSchedule(false);

      if (assignmentError) {
        notifySchedulesChanged();
        setDrawerFormError(assignmentError);
        announce(assignmentError);
        return;
      }

      notifySchedulesChanged();
      await closeAnimatedRightDrawer(dialogRef.current);

      const uniqueWarnings = [...new Set(collectedWarnings)];
      toast.success(
        uniqueWarnings.length > 0
          ? `Escala "${trimmedTitle}" salva (avisos: ${uniqueWarnings.join(", ")}).`
          : `Alterações salvas na escala "${trimmedTitle}".`
      );
      return;
    }

    if (!effectiveFormMinistryId) {
      setDrawerFormError("Selecione um ministério para criar a escala.");
      return;
    }

    setIsSavingSchedule(true);
    const createRes = await createSchedule({
      departmentId: effectiveFormMinistryId,
      name: trimmedTitle,
      scheduleAt,
      description: trimmedDetails,
      selfSignup: Boolean(formSelfSignup),
      ...(formSelfSignup
        ? { volunteersNeeded: Number(formVolunteersNeeded) }
        : {}),
    });

    if (!createRes.ok || !createRes.data) {
      setIsSavingSchedule(false);
      const msg =
        createRes.error || "Não foi possível criar o rascunho da escala.";
      setDrawerFormError(msg);
      announce(msg);
      return;
    }

    const createdId = createRes.data.id;
    const collectedWarnings = [];
    let assignWarningError = "";
    const assignableSelectedIds = selectedMemberIds.filter((id) =>
      canAssignMemberToSchedule(currentUser, {
        role: roleByMemberId.get(id),
      })
    );

    if (!formSelfSignup && assignableSelectedIds.length > 0) {
      const assignResults = await Promise.all(
        assignableSelectedIds.map((credentialId) =>
          assignCredentialToSchedule(createdId, credentialId)
        )
      );
      for (const res of assignResults) {
        if (!res.ok && !assignWarningError) {
          assignWarningError =
            res.error || "Um ou mais membros não puderam ser escalados.";
        } else if (res.ok && Array.isArray(res.data?.warnings)) {
          for (const w of res.data.warnings) {
            if (ASSIGNMENT_WARNING_LABELS[w]) {
              collectedWarnings.push(ASSIGNMENT_WARNING_LABELS[w]);
            }
          }
        }
      }
    }

    setIsSavingSchedule(false);
    notifySchedulesChanged();
    await closeAnimatedRightDrawer(dialogRef.current);

    if (assignWarningError) {
      toast.error(
        `Rascunho "${trimmedTitle}" criado, porém: ${assignWarningError}`
      );
      return;
    }

    const uniqueWarnings = [...new Set(collectedWarnings)];
    toast.success(
      uniqueWarnings.length > 0
        ? `Rascunho "${trimmedTitle}" adicionado (avisos: ${uniqueWarnings.join(", ")}).`
        : `Rascunho "${trimmedTitle}" adicionado à escala.`
    );
  };

  return (
    <dialog
      ref={dialogRef}
      data-side-drawer="right"
      aria-labelledby={drawerTitleId}
      className={styles.scheduleDrawer}
      onCancel={(eventObj) => {
        if (eventObj.cancelable) {
          eventObj.preventDefault();
          if (!isSavingSchedule) {
            closeAnimatedRightDrawer(dialogRef.current);
          }
        }
      }}
      onClose={handleDialogClose}
    >
      <div className="visually-hidden" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

      <div className={styles.scheduleDrawerHeader}>
        <div>
          <p className={styles.scheduleDrawerEyebrow}>PLANEJAMENTO</p>
          <h2 id={drawerTitleId} className={styles.scheduleDrawerTitle}>
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
          disabled={isSavingSchedule}
          className={styles.drawerCloseButton}
          onClick={() => closeAnimatedRightDrawer(dialogRef.current)}
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
                disabled={isSavingSchedule}
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
                disabled={isSavingSchedule}
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
                <div className={styles.fieldLabelRow}>
                  <label
                    htmlFor={recurringSelectId}
                    className={styles.drawerLabel}
                  >
                    Evento recorrente
                  </label>
                  <span className={styles.requiredTag}>Obrigatório</span>
                </div>
                {selectableRecurringEvents.length > 0 ? (
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
                      onChange={(e) =>
                        applyRecurringSelection(e.currentTarget.value)
                      }
                    >
                      <option value="" disabled>
                        Selecione um evento recorrente...
                      </option>
                      {selectableRecurringEvents.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} — {item.weekday} (
                          {(item.times || [item.time]).join(", ")})
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
                    Nenhum evento recorrente disponível. Cadastre modelos na aba
                    Eventos recorrentes para gerar escalas em lote.
                  </p>
                )}
              </div>

              {selectedRecurringEvent && (
                <>
                  <div className={styles.drawerTwoCol}>
                    <div className={styles.drawerField}>
                      <div className={styles.fieldLabelRow}>
                        <label
                          htmlFor={recurringMonthSelectId}
                          className={styles.drawerLabel}
                        >
                          Mês de geração
                        </label>
                        <span className={styles.requiredTag}>Obrigatório</span>
                      </div>
                      <select
                        id={recurringMonthSelectId}
                        name="recurringMonth"
                        value={recurringMonth}
                        className={styles.drawerSelect}
                        onChange={(e) => {
                          setRecurringMonth(e.currentTarget.value);
                          if (recurringError) setRecurringError("");
                        }}
                      >
                        {windowMonthOptions.map((ym, idx) => (
                          <option key={ym} value={ym}>
                            {idx === 0
                              ? "(mês atual)"
                              : formatYearMonthFullPt(ym)}
                          </option>
                        ))}
                        {windowMonthOptions.length > 1 && (
                          <option value="">Todo o período liberado</option>
                        )}
                      </select>
                    </div>

                    <div className={styles.drawerField}>
                      <div className={styles.fieldLabelRow}>
                        {isRecurringMinistryLocked ? (
                          <span className={styles.drawerLabel}>Ministério</span>
                        ) : (
                          <label
                            htmlFor={recurringMinistrySelectId}
                            className={styles.drawerLabel}
                          >
                            Ministério
                          </label>
                        )}
                        <span
                          className={
                            isRecurringMinistryLocked
                              ? styles.optionalTag
                              : styles.requiredTag
                          }
                        >
                          {isRecurringMinistryLocked
                            ? "Somente leitura"
                            : "Obrigatório"}
                        </span>
                      </div>

                      {isRecurringMinistryLocked ? (
                        <div className={styles.readonlyScopeBox}>
                          <strong className={styles.readonlyScopeValue}>
                            {availableRecurringDepartments[0]?.name ||
                              "Nenhum ministério disponível"}
                          </strong>
                        </div>
                      ) : (
                        <select
                          id={recurringMinistrySelectId}
                          name="recurringMinistry"
                          value={recurringTargetDeptId}
                          className={styles.drawerSelect}
                          onChange={(e) =>
                            setRecurringTargetDeptId(e.currentTarget.value)
                          }
                        >
                          <option value="all">
                            {selectedRecurringEvent.isGeneral
                              ? userIsAdmin
                                ? "Todos os ministérios"
                                : "Todos os meus ministérios"
                              : availableRecurringDepartments.length === 1
                                ? availableRecurringDepartments[0].name
                                : `Todos do modelo (${availableRecurringDepartments.length})`}
                          </option>
                          {availableRecurringDepartments.length > 1 &&
                            availableRecurringDepartments.map((dept) => (
                              <option key={dept.id} value={dept.id}>
                                {dept.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                  </div>

                  <div
                    className={`${styles.switchCard} ${
                      formSelfSignup ? styles.switchCardActive : ""
                    }`}
                  >
                    <div className={styles.switchHeaderRow}>
                      <div className={styles.switchLead}>
                        <label
                          htmlFor={selfSignupSwitchId}
                          className={styles.switchTitle}
                        >
                          Permitir inscrição voluntária
                        </label>
                        <p className={styles.switchHint}>
                          <strong>Importante:</strong> esta opção será aplicada
                          a{" "}
                          <strong>
                            todas as escalas que este evento recorrente criar
                          </strong>
                          .
                        </p>
                      </div>

                      <input
                        id={selfSignupSwitchId}
                        type="checkbox"
                        role="switch"
                        name="recurringSelfSignup"
                        checked={formSelfSignup}
                        className={styles.switchInput}
                        onChange={(e) => {
                          setFormSelfSignup(e.currentTarget.checked);
                          if (fieldErrors.volunteersNeeded) {
                            setFieldErrors((prev) => ({
                              ...prev,
                              volunteersNeeded: "",
                            }));
                          }
                        }}
                      />
                    </div>

                    {formSelfSignup && (
                      <div className={styles.volunteersNeededBox}>
                        <div className={styles.fieldLabelRow}>
                          <label
                            htmlFor={volunteersNeededInputId}
                            className={styles.drawerLabel}
                          >
                            Vagas por escala (quantas pessoas podem entrar)
                          </label>
                          <span className={styles.requiredTag}>Obrigatório</span>
                        </div>
                        <input
                          ref={volunteersNeededInputRef}
                          id={volunteersNeededInputId}
                          name="volunteersNeeded"
                          type="number"
                          inputMode="numeric"
                          min={1}
                          max={100}
                          step={1}
                          value={formVolunteersNeeded}
                          required
                          aria-invalid={
                            fieldErrors.volunteersNeeded ? "true" : "false"
                          }
                          aria-describedby={
                            fieldErrors.volunteersNeeded
                              ? volunteersNeededErrorId
                              : undefined
                          }
                          className={`${styles.drawerInput} ${
                            fieldErrors.volunteersNeeded
                              ? styles.drawerInputError
                              : ""
                          }`}
                          onChange={(e) => {
                            const nextVal = e.currentTarget.value;
                            setFormVolunteersNeeded(nextVal);
                            setDirtyFields((prev) => ({
                              ...prev,
                              volunteersNeeded: true,
                            }));
                            if (
                              fieldErrors.volunteersNeeded &&
                              !validateVolunteersNeededValue(nextVal)
                            ) {
                              setFieldErrors((prev) => ({
                                ...prev,
                                volunteersNeeded: "",
                              }));
                            }
                          }}
                          onBlur={() => handleFieldBlur("volunteersNeeded")}
                        />
                        {fieldErrors.volunteersNeeded && (
                          <div
                            id={volunteersNeededErrorId}
                            className={styles.fieldErrorMsg}
                          >
                            <AlertCircleIcon className={styles.fieldErrorIcon} />
                            <span>{fieldErrors.volunteersNeeded}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className={styles.drawerField}>
                <div className={styles.fieldLabelRow}>
                  <label
                    htmlFor={drawerTitleInputId}
                    className={styles.drawerLabel}
                  >
                    Nome do evento
                  </label>
                  <span className={styles.requiredTag}>Obrigatório</span>
                </div>
                <input
                  ref={titleInputRef}
                  id={drawerTitleInputId}
                  name="title"
                  type="text"
                  value={formTitle}
                  placeholder="Ex.: Culto de Celebração"
                  required
                  minLength={2}
                  maxLength={80}
                  aria-invalid={fieldErrors.title ? "true" : "false"}
                  aria-describedby={
                    fieldErrors.title ? drawerTitleErrorId : undefined
                  }
                  className={`${styles.drawerInput} ${
                    fieldErrors.title ? styles.drawerInputError : ""
                  }`}
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    setFormTitle(val);
                    setDirtyFields((prev) => ({ ...prev, title: true }));
                    if (fieldErrors.title && !validateTitleValue(val)) {
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
                  <div className={styles.fieldLabelRow}>
                    <label
                      htmlFor={drawerDateInputId}
                      className={styles.drawerLabel}
                    >
                      Data
                    </label>
                    <span className={styles.requiredTag}>Obrigatório</span>
                  </div>
                  <input
                    ref={dateInputRef}
                    id={drawerDateInputId}
                    name="dateIso"
                    type="date"
                    value={formDateIso}
                    min={todayIso}
                    max={scheduleWindow?.lastEditableDay || undefined}
                    required
                    aria-invalid={fieldErrors.dateIso ? "true" : "false"}
                    aria-describedby={
                      fieldErrors.dateIso ? drawerDateErrorId : undefined
                    }
                    className={`${styles.drawerInput} ${
                      fieldErrors.dateIso ? styles.drawerInputError : ""
                    }`}
                    onChange={(e) => {
                      const val = e.currentTarget.value;
                      setFormDateIso(val);
                      setDirtyFields((prev) => ({ ...prev, dateIso: true }));
                      if (
                        fieldErrors.dateIso &&
                        !validateDateIsoValue(val, todayIso, scheduleWindow)
                      ) {
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
                  <div className={styles.fieldLabelRow}>
                    <label
                      htmlFor={drawerTimeInputId}
                      className={styles.drawerLabel}
                    >
                      Horário
                    </label>
                    <span className={styles.requiredTag}>Obrigatório</span>
                  </div>
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
                    onChange={(e) => {
                      const val = e.currentTarget.value;
                      setFormTime(val);
                      setDirtyFields((prev) => ({ ...prev, time: true }));
                      if (fieldErrors.time && !validateTimeValue(val)) {
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

              <div className={styles.drawerField}>
                <div className={styles.fieldLabelRow}>
                  {isSpecificMinistryLocked ? (
                    <span className={styles.drawerLabel}>Ministério</span>
                  ) : (
                    <label
                      htmlFor={drawerMinistrySelectId}
                      className={styles.drawerLabel}
                    >
                      Ministério
                    </label>
                  )}
                  <span
                    className={
                      isSpecificMinistryLocked
                        ? styles.optionalTag
                        : styles.requiredTag
                    }
                  >
                    {isSpecificMinistryLocked ? "Somente leitura" : "Obrigatório"}
                  </span>
                </div>

                {isSpecificMinistryLocked ? (
                  <div className={styles.readonlyScopeBox}>
                    <strong className={styles.readonlyScopeValue}>
                      {assignableDepartments.find(
                        (d) => d.id === effectiveFormMinistryId
                      )?.name ||
                        activeDepartment?.name ||
                        event?.ministryName ||
                        "Nenhum ministério vinculado"}
                    </strong>
                  </div>
                ) : (
                  <select
                    id={drawerMinistrySelectId}
                    name="ministryId"
                    value={formMinistryId}
                    required
                    className={styles.drawerSelect}
                    onChange={(e) => {
                      setFormMinistryId(e.currentTarget.value);
                      setSelectedMemberIds([]);
                    }}
                  >
                    {assignableDepartments.length === 0 ? (
                      <option value="">Nenhum ministério disponível</option>
                    ) : (
                      assignableDepartments.map((ministry) => (
                        <option key={ministry.id} value={ministry.id}>
                          {ministry.name}
                        </option>
                      ))
                    )}
                  </select>
                )}
              </div>

              <div
                className={`${styles.switchCard} ${
                  formSelfSignup ? styles.switchCardActive : ""
                }`}
              >
                <div className={styles.switchHeaderRow}>
                  <div className={styles.switchLead}>
                    <label
                      htmlFor={selfSignupSwitchId}
                      className={styles.switchTitle}
                    >
                      Permitir inscrição voluntária
                    </label>
                    <p className={styles.switchHint}>
                      Os próprios membros do ministério escolhem se querem entrar
                      nesta escala até completar o número de vagas.
                    </p>
                  </div>

                  <input
                    id={selfSignupSwitchId}
                    type="checkbox"
                    role="switch"
                    name="selfSignup"
                    checked={formSelfSignup}
                    className={styles.switchInput}
                    onChange={(e) => {
                      setFormSelfSignup(e.currentTarget.checked);
                      if (fieldErrors.volunteersNeeded) {
                        setFieldErrors((prev) => ({
                          ...prev,
                          volunteersNeeded: "",
                        }));
                      }
                    }}
                  />
                </div>

                {formSelfSignup && (
                  <div className={styles.volunteersNeededBox}>
                    <div className={styles.fieldLabelRow}>
                      <label
                        htmlFor={volunteersNeededInputId}
                        className={styles.drawerLabel}
                      >
                        Quantas pessoas podem entrar na escala
                      </label>
                      <span className={styles.requiredTag}>Obrigatório</span>
                    </div>
                    <input
                      ref={volunteersNeededInputRef}
                      id={volunteersNeededInputId}
                      name="volunteersNeeded"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={100}
                      step={1}
                      value={formVolunteersNeeded}
                      required
                      aria-invalid={
                        fieldErrors.volunteersNeeded ? "true" : "false"
                      }
                      aria-describedby={
                        fieldErrors.volunteersNeeded
                          ? volunteersNeededErrorId
                          : undefined
                      }
                      className={`${styles.drawerInput} ${
                        fieldErrors.volunteersNeeded
                          ? styles.drawerInputError
                          : ""
                      }`}
                      onChange={(e) => {
                        const nextVal = e.currentTarget.value;
                        setFormVolunteersNeeded(nextVal);
                        setDirtyFields((prev) => ({
                          ...prev,
                          volunteersNeeded: true,
                        }));
                        if (
                          fieldErrors.volunteersNeeded &&
                          !validateVolunteersNeededValue(nextVal)
                        ) {
                          setFieldErrors((prev) => ({
                            ...prev,
                            volunteersNeeded: "",
                          }));
                        }
                      }}
                      onBlur={() => handleFieldBlur("volunteersNeeded")}
                    />
                    {fieldErrors.volunteersNeeded && (
                      <div
                        id={volunteersNeededErrorId}
                        className={styles.fieldErrorMsg}
                      >
                        <AlertCircleIcon className={styles.fieldErrorIcon} />
                        <span>{fieldErrors.volunteersNeeded}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!formSelfSignup && (
                <fieldset className={styles.memberFieldset}>
                  <legend className={styles.fieldsetLegendRow}>
                    <span>Membro(s) escalado(s)</span>
                    <span className={styles.optionalTag}>Opcional</span>
                  </legend>

                  {isLoadingAvailableMembers ? (
                    <p className={styles.recurringEmptyNote}>
                      Verificando disponibilidade dos membros...
                    </p>
                  ) : visibleMembers.length === 0 ? (
                    <p className={styles.recurringEmptyNote}>
                      Nenhum membro elegível disponível neste ministério ainda.
                    </p>
                  ) : (
                    <div className={styles.memberSelectorGrid}>
                      {visibleMembers.map((member) => {
                        const isSelected = selectedMemberIds.includes(
                          member.id
                        );

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
                                {member.handle || "Primeiro acesso"}
                              </span>
                              {member.availability && (
                                <span
                                  className={`${styles.memberAvailabilityTag} ${
                                    member.availability.available
                                      ? styles.memberAvailabilityOk
                                      : member.availability.isUnavailable
                                        ? styles.memberAvailabilityDanger
                                        : styles.memberAvailabilityWarn
                                  }`}
                                >
                                  {member.availability.available
                                    ? "Disponível"
                                    : member.availability.isUnavailable
                                      ? "Ausência no horário"
                                      : "Sem disponibilidade"}
                                </span>
                              )}
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
                  )}
                </fieldset>
              )}

              <div className={styles.drawerField}>
                <div className={styles.fieldLabelRow}>
                  <label
                    htmlFor={drawerDetailsInputId}
                    className={styles.drawerLabel}
                  >
                    Detalhes
                  </label>
                  <span className={styles.optionalTag}>Opcional</span>
                </div>
                <textarea
                  id={drawerDetailsInputId}
                  name="details"
                  rows={3}
                  value={formDetails}
                  maxLength={255}
                  placeholder="Orientações técnicas, horário de chegada..."
                  className={styles.drawerTextarea}
                  onChange={(e) => setFormDetails(e.currentTarget.value)}
                />
              </div>
            </>
          )}

          {drawerFormError && (
            <div className={styles.formBannerError} role="alert">
              <AlertCircleIcon className={styles.fieldErrorIcon} />
              <span>{drawerFormError}</span>
            </div>
          )}
        </div>

        <div className={styles.scheduleDrawerFooter}>
          <button
            type="button"
            disabled={isSavingSchedule}
            className={styles.drawerCancelButton}
            onClick={() => closeAnimatedRightDrawer(dialogRef.current)}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={
              isSavingSchedule ||
              (isRecurringCreate &&
                (!selectedRecurringEvent ||
                  recurringPreview.totalSlots === 0 ||
                  availableRecurringDepartments.length === 0))
            }
            aria-busy={isSavingSchedule}
            className={styles.drawerSubmitButton}
          >
            {isEditing ? <CheckIcon /> : <PlusIcon />}
            <span>
              {isSavingSchedule
                ? isEditing
                  ? "Salvando..."
                  : "Criando..."
                : isEditing
                  ? "Salvar alterações"
                  : isRecurringCreate
                    ? recurringTotalDrafts > 0
                      ? `Criar ${recurringTotalDrafts} ${
                          recurringTotalDrafts === 1
                            ? "rascunho"
                            : "rascunhos"
                        }`
                      : "Criar rascunhos"
                    : "Salvar rascunho"}
            </span>
          </button>
        </div>
      </form>
    </dialog>
  );
}
