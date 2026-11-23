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
  ClockIcon,
  CloseIcon,
  InfoCircleIcon,
  PencilIcon,
  SearchIcon,
  SendIcon,
  SwapIcon,
  TrashIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { usePrivateWorkspace } from "@/components/layout/PrivateShell";
import { useToast } from "@/components/ui/ToastProvider";
import {
  cancelChangeRequest,
  deleteSchedule,
  formatScheduleForUi,
  getScheduleById,
  getScheduleWindow,
  listMyAssignments,
  listMyChangeRequests,
  listOpenSchedules,
  listSchedules,
  requestScheduleChange,
  signUpForSchedule,
  updateSchedule,
} from "@/features/schedules/services/schedulesService";
import {
  APP_TIME_ZONE,
  compareScheduleEvents,
  extractDateAndTimeInZone,
  formatScheduleDateDisplay,
  getStartOfCurrentMonthIsoInZone,
  isScheduleAtInsideWindow,
} from "@/features/schedules/utils/scheduleDates";
import {
  canManageAnySchedule,
  canManageScheduleOf,
  CREDENTIAL_STATUS,
  getAssignableDepartments,
  getDepartmentIds,
  isAdmin,
  isAtLeast,
  resolveRoleCode,
  ROLES,
} from "@/lib/roles";
import styles from "./MonthlyScheduleView.module.css";

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

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function doesEventMatchSearch(event, normalizedQuery) {
  if (!normalizedQuery) return true;
  const haystack = [
    event.title,
    event.ministryName,
    ...(event.assignments || []).map(
      (person) => `${person.name} ${person.handle ?? ""}`
    ),
  ]
    .map(normalizeText)
    .join(" ");

  return haystack.includes(normalizedQuery);
}

export function MonthlyScheduleView() {
  const {
    activeMinistry,
    departments,
    participants,
    currentUser,
    openWorkspaceDrawer,
    schedulesVersion,
  } = usePrivateWorkspace();
  const toast = useToast();

  const roleCode = resolveRoleCode(currentUser);
  const userIsAdmin = isAdmin(currentUser);
  const isGeneralManager = roleCode === ROLES.GENERAL_MANAGER;
  const isManagementOnly = isAtLeast(currentUser, ROLES.GENERAL_MANAGER);
  const userDepartmentIds = useMemo(
    () => getDepartmentIds(currentUser),
    [currentUser]
  );
  const userManagedDepartments = useMemo(
    () => getAssignableDepartments(currentUser, departments),
    [currentUser, departments]
  );
  const canManageAny = useMemo(
    () => canManageAnySchedule(currentUser, departments),
    [currentUser, departments]
  );
  const activeMinistryId =
    activeMinistry?.id && !activeMinistry.isGlobal
      ? activeMinistry.id
      : userDepartmentIds[0] || "";

  const searchInputId = useId();
  const scopeSelectId = useId();
  const modalTitleId = useId();
  const substituteSelectId = useId();
  const substituteErrorId = useId();
  const confirmModalTitleId = useId();

  const absenceDialogRef = useRef(null);
  const confirmDialogRef = useRef(null);
  const confirmCancelBtnRef = useRef(null);
  const announceTimerRef = useRef(null);

  const [scheduleWindow, setScheduleWindow] = useState(null);
  const [referenceNowMs, setReferenceNowMs] = useState(0);
  const [events, setEvents] = useState([]);
  const [myAssignments, setMyAssignments] = useState([]);
  const [changeRequests, setChangeRequests] = useState({
    received: [],
    sent: [],
  });
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(true);
  const [schedulesLoadError, setSchedulesLoadError] = useState("");
  const [liveAnnouncement, setLiveAnnouncement] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const defaultScopeFilter = userIsAdmin ? "all-ministries" : "my-ministry";
  const [scopeFilter, setScopeFilter] = useState(() =>
    userIsAdmin ? "all-ministries" : "my-ministry"
  );

  // Absence modal state
  const [absenceTargetSchedule, setAbsenceTargetSchedule] = useState(null);
  const [suggestedSubstituteId, setSuggestedSubstituteId] = useState("");
  const [substituteError, setSubstituteError] = useState("");
  const [absenceFormError, setAbsenceFormError] = useState("");
  const [isSubmittingAbsence, setIsSubmittingAbsence] = useState(false);
  const [cancelingAssignmentId, setCancelingAssignmentId] = useState("");

  // Self-signup row action state
  const [busySignupScheduleId, setBusySignupScheduleId] = useState("");

  // Confirmation modal state
  const [confirmModal, setConfirmModal] = useState(null);
  const [confirmError, setConfirmError] = useState("");
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);

  const fetchAllScheduleState = useCallback(async () => {
    const startOfMonthIso = getStartOfCurrentMonthIsoInZone(APP_TIME_ZONE);

    const [windowRes, listRes, mineRes, openRes, crRes] = await Promise.all([
      getScheduleWindow(),
      listSchedules(startOfMonthIso ? { from: startOfMonthIso } : {}),
      isManagementOnly
        ? Promise.resolve({ ok: true, data: [] })
        : listMyAssignments(),
      isManagementOnly
        ? Promise.resolve({ ok: true, data: [] })
        : listOpenSchedules(),
      isManagementOnly
        ? Promise.resolve({ ok: true, data: { received: [], sent: [] } })
        : listMyChangeRequests(),
    ]);

    if (!listRes.ok || !Array.isArray(listRes.data)) {
      return {
        ok: false,
        error: listRes.error || "Não foi possível carregar as escalas.",
      };
    }

    const openMap = new Map(
      (openRes.ok && Array.isArray(openRes.data) ? openRes.data : []).map(
        (item) => [item.id, item]
      )
    );

    const hydratedRaw = await Promise.all(
      listRes.data.map(async (summary) => {
        if ((summary.assignedCount ?? 0) === 0) {
          return { ...summary, assignments: [] };
        }
        const detailRes = await getScheduleById(summary.id);
        return detailRes.ok && detailRes.data ? detailRes.data : summary;
      })
    );

    const formattedEvents = hydratedRaw
      .map((raw) => {
        const openMeta = openMap.get(raw.id);
        const merged = openMeta
          ? {
              ...raw,
              signedUp: openMeta.signedUp,
              freeSlots: openMeta.freeSlots,
            }
          : raw;
        return formatScheduleForUi(merged);
      })
      .filter(Boolean)
      .sort(compareScheduleEvents);

    return {
      ok: true,
      windowData: windowRes.ok ? windowRes.data : null,
      fetchedAtMs:
        windowRes.ok && windowRes.data?.editableFrom
          ? new Date(windowRes.data.editableFrom).getTime()
          : Date.now(),
      events: formattedEvents,
      myAssignments:
        mineRes.ok && Array.isArray(mineRes.data) ? mineRes.data : [],
      changeRequests:
        crRes.ok && crRes.data
          ? {
              received: Array.isArray(crRes.data.received)
                ? crRes.data.received
                : [],
              sent: Array.isArray(crRes.data.sent) ? crRes.data.sent : [],
            }
          : { received: [], sent: [] },
    };
  }, [isManagementOnly]);

  const refreshSchedules = useCallback(async () => {
    setSchedulesLoadError("");
    const result = await fetchAllScheduleState();
    setIsLoadingSchedules(false);

    if (!result.ok) {
      setSchedulesLoadError(result.error);
      return false;
    }

    if (result.windowData) {
      setScheduleWindow(result.windowData);
    }
    setReferenceNowMs(result.fetchedAtMs);
    setEvents(result.events);
    setMyAssignments(result.myAssignments);
    setChangeRequests(result.changeRequests);
    return true;
  }, [fetchAllScheduleState]);

  useEffect(() => {
    let active = true;

    async function initSchedules() {
      const result = await fetchAllScheduleState();
      if (!active) return;

      setIsLoadingSchedules(false);
      if (!result.ok) {
        setSchedulesLoadError(result.error);
        return;
      }

      if (result.windowData) {
        setScheduleWindow(result.windowData);
      }
      setReferenceNowMs(result.fetchedAtMs);
      setEvents(result.events);
      setMyAssignments(result.myAssignments);
      setChangeRequests(result.changeRequests);
    }

    initSchedules();

    return () => {
      active = false;
    };
  }, [fetchAllScheduleState, schedulesVersion]);

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

  useEffect(() => {
    const cleanAbsence = setupClosedByFallback(absenceDialogRef.current, () => {
      if (!isSubmittingAbsence) {
        absenceDialogRef.current?.close("cancel");
      }
    });
    const cleanConfirm = setupClosedByFallback(confirmDialogRef.current, () => {
      if (!isConfirmingAction) {
        confirmDialogRef.current?.close("cancel");
      }
    });

    return () => {
      if (cleanAbsence) cleanAbsence();
      if (cleanConfirm) cleanConfirm();
    };
  }, [isConfirmingAction, isSubmittingAbsence]);

  const draftEvents = useMemo(
    () =>
      events.filter(
        (item) =>
          item.statusTone === "draft" &&
          canManageScheduleOf(currentUser, item.ministryId) &&
          (!isGeneralManager ||
            !activeMinistryId ||
            item.ministryId === activeMinistryId) &&
          (!scheduleWindow ||
            isScheduleAtInsideWindow(item.scheduleAt, scheduleWindow))
      ),
    [activeMinistryId, currentUser, events, isGeneralManager, scheduleWindow]
  );

  const pendingReceivedRequest = changeRequests.received[0] || null;

  const sentChangeByAssignmentId = useMemo(
    () =>
      new Map(
        (changeRequests.sent || [])
          .filter((req) => req?.id)
          .map((req) => [req.id, req])
      ),
    [changeRequests.sent]
  );

  const nextUserSchedule = useMemo(() => {
    if (isManagementOnly || myAssignments.length === 0) return null;

    const first = myAssignments[0];
    if (!first?.schedule) return null;

    const { dateIso, time } = extractDateAndTimeInZone(
      first.schedule.scheduleAt,
      APP_TIME_ZONE
    );
    const dateInfo = formatScheduleDateDisplay(dateIso);
    const matchingSent = sentChangeByAssignmentId.get(first.id);

    return {
      assignmentId: first.id,
      scheduleId: first.schedule.id,
      scheduleAt: first.schedule.scheduleAt,
      day: dateInfo.day,
      monthShort: dateInfo.monthShort,
      ministryId: first.schedule.department?.id || "",
      ministryName: first.schedule.department?.name || "Ministério",
      title: first.schedule.name,
      fullDateLabel: dateInfo.fullDateLabel,
      time,
      description: first.schedule.description || "",
      changeStatus: matchingSent?.changeStatus || first.changeStatus || "NONE",
      credentialChange:
        matchingSent?.credentialChange || first.credentialChange || null,
    };
  }, [isManagementOnly, myAssignments, sentChangeByAssignmentId]);

  // Real eligible teammates for requesting substitution in the selected schedule
  const eligibleSubstitutes = useMemo(() => {
    if (!absenceTargetSchedule?.ministryId) return [];

    const fullSchedule = events.find(
      (ev) => ev.id === absenceTargetSchedule.scheduleId
    );
    const alreadyAssignedIds = new Set(
      (fullSchedule?.assignments || []).map((a) => a.memberId)
    );

    if (participants.length > 0) {
      return participants
        .filter(
          (person) =>
            person.id !== currentUser.id &&
            person.status !== CREDENTIAL_STATUS.INACTIVE &&
            !isAtLeast(person, ROLES.GENERAL_MANAGER) &&
            person.departmentIds?.includes(absenceTargetSchedule.ministryId) &&
            !alreadyAssignedIds.has(person.id)
        )
        .map((person) => ({
          id: person.id,
          name: person.name,
          handle: person.handle || "",
        }));
    }

    const fromPublished = new Map();
    for (const ev of events) {
      if (ev.ministryId !== absenceTargetSchedule.ministryId) continue;
      for (const asg of ev.assignments || []) {
        if (
          asg.memberId &&
          asg.memberId !== currentUser.id &&
          (!asg.roleCode ||
            !isAtLeast({ role: asg.roleCode }, ROLES.GENERAL_MANAGER)) &&
          !alreadyAssignedIds.has(asg.memberId) &&
          !fromPublished.has(asg.memberId)
        ) {
          fromPublished.set(asg.memberId, {
            id: asg.memberId,
            name: asg.name,
            handle: asg.handle || "",
          });
        }
      }
    }
    return [...fromPublished.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR")
    );
  }, [absenceTargetSchedule, currentUser.id, events, participants]);

  const filteredEvents = useMemo(() => {
    const query = normalizeText(searchQuery);

    return events.filter((event) => {
      if (isGeneralManager) {
        if (activeMinistryId && event.ministryId !== activeMinistryId) {
          return false;
        }
      } else if (scopeFilter === "my-ministry" && activeMinistryId) {
        if (event.ministryId !== activeMinistryId) return false;
      } else if (scopeFilter === "my-scales") {
        const isAssigned = event.assignments.some(
          (person) => person.memberId === currentUser.id
        );
        if (!isAssigned) return false;
      } else if (scopeFilter === "open-signup") {
        if (!event.selfSignup || !event.published) return false;
      } else if (scopeFilter.startsWith("dept:")) {
        const deptId = scopeFilter.slice(5);
        if (event.ministryId !== deptId) return false;
      }

      return doesEventMatchSearch(event, query);
    });
  }, [
    activeMinistryId,
    currentUser.id,
    events,
    isGeneralManager,
    scopeFilter,
    searchQuery,
  ]);

  const handleOpenSubstitutionDrawer = () => {
    if (!pendingReceivedRequest) return;
    openWorkspaceDrawer("substitution", { request: pendingReceivedRequest });
  };

  const handleOpenAbsenceModal = (targetSchedule) => {
    const dialog = absenceDialogRef.current;
    if (!dialog || dialog.open || !targetSchedule?.assignmentId) return;

    setAbsenceTargetSchedule(targetSchedule);
    setSuggestedSubstituteId("");
    setSubstituteError("");
    setAbsenceFormError("");
    setIsSubmittingAbsence(false);
    dialog.returnValue = "";
    dialog.showModal();
  };

  const handleAbsenceDialogClose = () => {
    const dialog = absenceDialogRef.current;
    if (dialog) {
      dialog.returnValue = "";
    }
    setAbsenceTargetSchedule(null);
    setSuggestedSubstituteId("");
    setSubstituteError("");
    setAbsenceFormError("");
    setIsSubmittingAbsence(false);
  };

  const handleAbsenceSubmit = async (event) => {
    event.preventDefault();
    if (isSubmittingAbsence || !absenceTargetSchedule?.assignmentId) return;

    setSubstituteError("");
    setAbsenceFormError("");

    if (!suggestedSubstituteId) {
      const msg = "Selecione um membro do ministério para indicar como substituto.";
      setSubstituteError(msg);
      announce(msg);
      return;
    }

    setIsSubmittingAbsence(true);
    const res = await requestScheduleChange({
      assignmentId: absenceTargetSchedule.assignmentId,
      substituteId: suggestedSubstituteId,
    });
    setIsSubmittingAbsence(false);

    if (!res.ok) {
      setAbsenceFormError(
        res.error || "Não foi possível enviar o pedido de substituição."
      );
      return;
    }

    const chosen = eligibleSubstitutes.find(
      (mate) => mate.id === suggestedSubstituteId
    );
    absenceDialogRef.current?.close("confirm");
    await refreshSchedules();
    toast.success(
      chosen
        ? `Substituição solicitada indicando ${chosen.name}.`
        : "Solicitação de substituição enviada."
    );
  };

  const handleCancelAbsence = async (assignmentId, fullDateLabel) => {
    if (cancelingAssignmentId || !assignmentId) return;

    setCancelingAssignmentId(assignmentId);
    const res = await cancelChangeRequest(assignmentId);
    setCancelingAssignmentId("");

    if (!res.ok) {
      toast.error(
        res.error || "Não foi possível cancelar o pedido de substituição."
      );
      return;
    }

    await refreshSchedules();
    toast.success(
      fullDateLabel
        ? `Participação mantida na escala de ${fullDateLabel}.`
        : "Pedido de substituição cancelado."
    );
  };

  const handleSignUpClick = async (eventItem) => {
    if (busySignupScheduleId) return;
    setBusySignupScheduleId(eventItem.id);
    const res = await signUpForSchedule(eventItem.id);
    setBusySignupScheduleId("");

    if (!res.ok) {
      toast.error(res.error || "Não foi possível realizar sua inscrição.");
      return;
    }

    await refreshSchedules();
    toast.success(`Inscrição confirmada em "${eventItem.title}".`);
  };

  const openCreateScheduleDrawer = () => {
    if (!canManageAny) return;
    openWorkspaceDrawer("schedule-form", {
      mode: "create",
      scheduleWindow,
    });
  };

  const openEditScheduleDrawer = (eventItem) => {
    if (!eventItem) return;
    openWorkspaceDrawer("schedule-form", {
      mode: "edit",
      event: eventItem,
      scheduleWindow,
    });
  };

  const openConfirmModal = (payload) => {
    const dialog = confirmDialogRef.current;
    if (!dialog || dialog.open) return;

    setConfirmModal(payload);
    setConfirmError("");
    setIsConfirmingAction(false);
    dialog.returnValue = "";
    dialog.showModal();
    window.requestAnimationFrame(() => {
      confirmCancelBtnRef.current?.focus();
    });
  };

  const handleConfirmDialogClose = () => {
    const dialog = confirmDialogRef.current;
    if (dialog) {
      dialog.returnValue = "";
    }
    setConfirmModal(null);
    setConfirmError("");
    setIsConfirmingAction(false);
  };

  const handleConfirmActionSubmit = async (event) => {
    event.preventDefault();
    if (isConfirmingAction || !confirmModal) return;

    setConfirmError("");
    setIsConfirmingAction(true);

    if (confirmModal.type === "delete" && confirmModal.event) {
      const targetName = confirmModal.event.title;
      const res = await deleteSchedule(confirmModal.event.id);
      setIsConfirmingAction(false);

      if (!res.ok) {
        setConfirmError(res.error || "Não foi possível excluir a escala.");
        return;
      }

      confirmDialogRef.current?.close("confirm");
      await refreshSchedules();
      toast.success(`Escala "${targetName}" excluída definitivamente.`);
      return;
    }

    if (confirmModal.type === "publish-one" && confirmModal.event) {
      const targetName = confirmModal.event.title;
      const res = await updateSchedule(confirmModal.event.id, {
        published: true,
      });
      setIsConfirmingAction(false);

      if (!res.ok) {
        setConfirmError(res.error || "Não foi possível publicar a escala.");
        return;
      }

      confirmDialogRef.current?.close("confirm");
      await refreshSchedules();
      toast.success(`Escala "${targetName}" publicada para a equipe.`);
      return;
    }

    if (confirmModal.type === "publish-all") {
      const results = await Promise.all(
        draftEvents.map((item) => updateSchedule(item.id, { published: true }))
      );
      setIsConfirmingAction(false);

      const failed = results.filter((r) => !r.ok);
      const publishedCount = results.length - failed.length;

      if (publishedCount > 0) {
        await refreshSchedules();
      }

      if (failed.length > 0) {
        setConfirmError(
          failed[0].error ||
            `Não foi possível publicar ${failed.length} escala(s).`
        );
        return;
      }

      confirmDialogRef.current?.close("confirm");
      toast.success(
        `Todas as ${publishedCount} escala(s) pendentes foram publicadas.`
      );
    }
  };

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    (!isGeneralManager && scopeFilter !== defaultScopeFilter);

  const handleResetFilters = () => {
    setSearchQuery("");
    setScopeFilter(defaultScopeFilter);
  };

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLead}>
          <p className={styles.pageEyebrow}>PLANEJAMENTO MENSAL</p>
          <h1 className={styles.pageTitle}>Escala do mês</h1>
          <p className={styles.pageSubtitle}>
            Organize escalas, inscrições voluntárias e substituições com
            clareza.
          </p>
        </div>

        {canManageAny && (
          <div className={styles.headerActions}>
            <button
              type="button"
              disabled={draftEvents.length === 0}
              className={styles.publishAllButton}
              onClick={() =>
                openConfirmModal({
                  type: "publish-all",
                  count: draftEvents.length,
                })
              }
            >
              <SendIcon />
              <span>
                {draftEvents.length > 0
                  ? "Publicar pendentes"
                  : "Tudo publicado"}
              </span>
              {draftEvents.length > 0 && (
                <span className={styles.publishAllCount}>
                  {draftEvents.length}
                </span>
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
        )}
      </header>

      <div className="visually-hidden" aria-live="polite" role="status">
        {liveAnnouncement}
      </div>

      {pendingReceivedRequest && (
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
                {pendingReceivedRequest.credential?.name} indicou você para uma
                substituição
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

              {nextUserSchedule.changeStatus === "REQUESTED" ? (
                <span
                  className={`${styles.statusPill} ${styles.statusPillAmber}`}
                >
                  <span className={styles.statusDot} aria-hidden="true" />
                  Substituição solicitada
                  {nextUserSchedule.credentialChange?.name
                    ? ` (${nextUserSchedule.credentialChange.name})`
                    : ""}
                </span>
              ) : nextUserSchedule.changeStatus === "REJECTED" ? (
                <span
                  className={`${styles.statusPill} ${styles.statusPillAmber}`}
                >
                  <span className={styles.statusDot} aria-hidden="true" />
                  Indicação recusada
                </span>
              ) : (
                <span
                  className={`${styles.statusPill} ${styles.statusPillInfo}`}
                >
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

            {nextUserSchedule.description && (
              <div className={styles.noticeBox}>
                <InfoCircleIcon className={styles.noticeIcon} />
                <p>{nextUserSchedule.description}</p>
              </div>
            )}

            <div className={styles.heroFooterRow}>
              <span className={styles.checkInHint}>
                <ClockIcon className={styles.checkInIcon} />
                <span>Confira o horário de chegada com sua liderança</span>
              </span>

              {nextUserSchedule.changeStatus === "REQUESTED" ||
              nextUserSchedule.changeStatus === "REJECTED" ? (
                <button
                  type="button"
                  disabled={
                    cancelingAssignmentId === nextUserSchedule.assignmentId
                  }
                  className={styles.absenceButton}
                  onClick={() =>
                    handleCancelAbsence(
                      nextUserSchedule.assignmentId,
                      nextUserSchedule.fullDateLabel
                    )
                  }
                >
                  {cancelingAssignmentId === nextUserSchedule.assignmentId
                    ? "Cancelando..."
                    : "Cancelar pedido de troca"}
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.absenceButton}
                  onClick={() => handleOpenAbsenceModal(nextUserSchedule)}
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
            Pesquisar pelo nome do evento ou pessoa
          </label>
          <SearchIcon className={styles.searchIcon} />
          <input
            id={searchInputId}
            type="search"
            value={searchQuery}
            placeholder="Pesquisar pelo nome do evento ou pessoa..."
            autoCorrect="off"
            spellCheck={false}
            className={styles.searchInput}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
          />
        </div>

        <div className={styles.filterRightGroup}>
          {!isGeneralManager && (
            <>
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
                {!userIsAdmin && activeMinistryId && (
                  <option value="my-ministry">Escala do meu ministério</option>
                )}
                {!isManagementOnly && (
                  <option value="my-scales">Minhas escalas</option>
                )}
                {!isManagementOnly && (
                  <option value="open-signup">Vagas abertas</option>
                )}
                <option value="all-ministries">
                  {userIsAdmin ? "Todos os ministérios" : "Escala geral"}
                </option>
                {userIsAdmin &&
                  userManagedDepartments.map((dept) => (
                    <option key={dept.id} value={`dept:${dept.id}`}>
                      {dept.name}
                    </option>
                  ))}
              </select>
            </>
          )}

          <span className={styles.eventCount}>
            {filteredEvents.length} evento(s)
          </span>
        </div>
      </search>

      <section
        className={styles.eventsList}
        aria-label="Lista de eventos do mês"
      >
        {isLoadingSchedules ? (
          <div className={styles.emptyState} role="status">
            <p className={styles.emptyTitle}>Carregando escalas...</p>
          </div>
        ) : schedulesLoadError ? (
          <div className={styles.emptyState} role="alert">
            <p className={styles.emptyTitle}>{schedulesLoadError}</p>
            <button
              type="button"
              className={styles.emptyResetBtn}
              onClick={() => refreshSchedules()}
            >
              Tentar novamente
            </button>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyIconBadge} aria-hidden="true">
              <CalendarIcon />
            </span>
            <p className={styles.emptyTitle}>
              {events.length === 0
                ? "Nenhuma escala cadastrada ainda"
                : "Nenhum evento encontrado"}
            </p>
            {hasActiveFilters ? (
              <>
                <p className={styles.emptyDesc}>
                  Tente ajustar os termos da busca ou mudar o filtro de
                  visualização.
                </p>
                <button
                  type="button"
                  className={styles.emptyResetBtn}
                  onClick={handleResetFilters}
                >
                  Limpar filtros
                </button>
              </>
            ) : canManageAny ? (
              <p className={styles.emptyDesc}>
                Use o botão <strong>Nova escala</strong> acima para criar uma
                escala avulsa ou gerar escalas a partir de um evento recorrente.
              </p>
            ) : (
              <p className={styles.emptyDesc}>
                As próximas escalas publicadas dos seus ministérios aparecerão
                aqui.
              </p>
            )}
          </div>
        ) : (
          filteredEvents.map((event) => {
            const isPublished = event.statusTone === "published";
            const myEventAssignment = event.assignments.find(
              (person) => person.memberId === currentUser.id
            );
            const isUserScheduled = Boolean(myEventAssignment);
            const myChangeRequest = myEventAssignment
              ? sentChangeByAssignmentId.get(myEventAssignment.id) || null
              : null;
            const myChangeStatus =
              myChangeRequest?.changeStatus ||
              myEventAssignment?.changeStatus ||
              "NONE";
            const canManageThis = canManageScheduleOf(
              currentUser,
              event.ministryId
            );
            const isInEditableWindow =
              !scheduleWindow ||
              isScheduleAtInsideWindow(event.scheduleAt, scheduleWindow);
            const isMemberOfDepartment = userDepartmentIds.includes(
              event.ministryId
            );
            const isUpcoming =
              new Date(event.scheduleAt).getTime() > referenceNowMs;
            const canSelfAct =
              !isManagementOnly &&
              isMemberOfDepartment &&
              isPublished &&
              event.selfSignup &&
              isUpcoming;
            const canRequestAbsenceOnCard =
              !isManagementOnly &&
              isPublished &&
              isUpcoming &&
              Boolean(myEventAssignment);
            const hasFreeSlots =
              typeof event.volunteersNeeded === "number" &&
              event.assignedCount < event.volunteersNeeded;

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

                    <div className={styles.eventTopBadges}>
                      {event.selfSignup && (
                        <span className={styles.selfSignupBadge}>
                          Inscrição voluntária
                        </span>
                      )}

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
                  </div>

                  <div className={styles.eventMetaRow}>
                    <span className={styles.factItem}>
                      <ClockIcon className={styles.factIcon} />
                      <span>{event.time}</span>
                    </span>
                    <span className={styles.factItem}>
                      <UsersIcon className={styles.factIcon} />
                      <span>
                        {event.selfSignup && event.volunteersNeeded
                          ? `${event.assignedCount}/${event.volunteersNeeded} vaga(s) preenchida(s)`
                          : `${event.assignedCount} escalado(s)`}
                      </span>
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
                      {event.selfSignup
                        ? "Nenhuma inscrição voluntária registrada ainda."
                        : "Nenhum membro escalado ainda."}
                    </p>
                  ) : (
                    <div className={styles.assignmentsGrid}>
                      {event.assignments.map((person) => {
                        let badgeToneClass = styles.attendanceConfirmed;
                        let badgeLabel = "Escalado";
                        if (person.changeStatus === "REQUESTED") {
                          badgeToneClass = styles.attendancePending;
                          badgeLabel = "Troca pendente";
                        } else if (person.changeStatus === "REJECTED") {
                          badgeToneClass = styles.attendancePending;
                          badgeLabel = "Troca recusada";
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
                                {person.handle || "Primeiro acesso"}
                              </span>
                            </div>

                            <span
                              className={`${styles.attendanceBadge} ${badgeToneClass}`}
                            >
                              <span
                                className={styles.statusDot}
                                aria-hidden="true"
                              />
                              {badgeLabel}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {(canManageThis || canSelfAct || canRequestAbsenceOnCard) && (
                    <div className={styles.eventActionsBar}>
                      {canSelfAct &&
                        !isUserScheduled &&
                        !event.signedUp &&
                        hasFreeSlots && (
                          <button
                            type="button"
                            disabled={busySignupScheduleId === event.id}
                            className={`${styles.cardActionButton} ${styles.cardSignupButton}`}
                            onClick={() => handleSignUpClick(event)}
                          >
                            {busySignupScheduleId === event.id
                              ? "Inscrevendo..."
                              : "Inscrever-me"}
                          </button>
                        )}

                      {canRequestAbsenceOnCard &&
                        (myChangeStatus === "REQUESTED" ||
                        myChangeStatus === "REJECTED" ? (
                          <button
                            type="button"
                            disabled={
                              cancelingAssignmentId === myEventAssignment.id
                            }
                            className={`${styles.cardActionButton} ${styles.cardWithdrawButton}`}
                            onClick={() =>
                              handleCancelAbsence(
                                myEventAssignment.id,
                                event.fullDateLabel
                              )
                            }
                          >
                            {cancelingAssignmentId === myEventAssignment.id
                              ? "Cancelando..."
                              : "Cancelar pedido de troca"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={`${styles.cardActionButton} ${styles.cardWithdrawButton}`}
                            onClick={() =>
                              handleOpenAbsenceModal({
                                assignmentId: myEventAssignment.id,
                                scheduleId: event.id,
                                ministryId: event.ministryId,
                                title: event.title,
                                fullDateLabel: event.fullDateLabel,
                                time: event.time,
                              })
                            }
                          >
                            Não conseguirei participar
                          </button>
                        ))}

                      {canManageThis && !isInEditableWindow && (
                        <span className={styles.lockedWindowBadge}>
                          Fora do período editável
                        </span>
                      )}

                      {canManageThis && isInEditableWindow && (
                        <>
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
                        </>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })
        )}
      </section>

      {/* Modal: Indicar substituto (POST /change-requests) */}
      <dialog
        ref={absenceDialogRef}
        closedby="any"
        aria-labelledby={modalTitleId}
        className={styles.modalDialog}
        onCancel={(event) => {
          if (isSubmittingAbsence) {
            event.preventDefault();
          }
        }}
        onClose={handleAbsenceDialogClose}
      >
        <form
          className={styles.modalForm}
          noValidate
          onSubmit={handleAbsenceSubmit}
        >
          <h2 id={modalTitleId} className={styles.modalTitle}>
            Não conseguirei participar
          </h2>
          <p className={styles.modalSubtitle}>
            Indique um membro ativo do mesmo ministério para assumir sua vaga em{" "}
            <strong>
              {absenceTargetSchedule?.title} (
              {absenceTargetSchedule?.fullDateLabel},{" "}
              {absenceTargetSchedule?.time})
            </strong>
            .
          </p>

          <div className={styles.modalField}>
            <div className={styles.fieldLabelRow}>
              <label htmlFor={substituteSelectId} className={styles.modalLabel}>
                Indicar substituto
              </label>
              <span className={styles.requiredTag}>Obrigatório</span>
            </div>

            {eligibleSubstitutes.length > 0 ? (
              <select
                id={substituteSelectId}
                value={suggestedSubstituteId}
                required
                aria-invalid={substituteError ? "true" : "false"}
                aria-describedby={
                  substituteError ? substituteErrorId : undefined
                }
                className={`${styles.modalSelect} ${
                  substituteError ? styles.drawerInputError : ""
                }`}
                onChange={(event) => {
                  setSuggestedSubstituteId(event.currentTarget.value);
                  if (substituteError) setSubstituteError("");
                }}
              >
                <option value="">Selecione um participante...</option>
                {eligibleSubstitutes.map((mate) => (
                  <option key={mate.id} value={mate.id}>
                    {mate.name}
                    {mate.handle ? ` (${mate.handle})` : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className={styles.recurringEmptyNote}>
                Não há outros participantes disponíveis listados para este
                ministério neste momento.
              </p>
            )}

            {substituteError && (
              <div id={substituteErrorId} className={styles.fieldErrorMsg}>
                <AlertCircleIcon className={styles.fieldErrorIcon} />
                <span>{substituteError}</span>
              </div>
            )}
          </div>

          {absenceFormError && (
            <div className={styles.formBannerError} role="alert">
              <AlertCircleIcon className={styles.fieldErrorIcon} />
              <span>{absenceFormError}</span>
            </div>
          )}

          <div className={styles.modalActions}>
            <button
              type="button"
              autoFocus
              disabled={isSubmittingAbsence}
              className={styles.modalCancelButton}
              onClick={() => absenceDialogRef.current?.close("cancel")}
            >
              Voltar
            </button>
            {eligibleSubstitutes.length > 0 && (
              <button
                type="submit"
                disabled={isSubmittingAbsence}
                aria-busy={isSubmittingAbsence}
                className={styles.modalConfirmButton}
              >
                {isSubmittingAbsence
                  ? "Enviando..."
                  : "Enviar pedido de substituição"}
              </button>
            )}
          </div>
        </form>
      </dialog>

      {/* Irreversible Action Confirmation Modal */}
      <dialog
        ref={confirmDialogRef}
        closedby="any"
        aria-labelledby={confirmModalTitleId}
        className={styles.confirmDialog}
        onCancel={(event) => {
          if (isConfirmingAction) {
            event.preventDefault();
          }
        }}
        onClose={handleConfirmDialogClose}
      >
        <form
          className={styles.confirmForm}
          onSubmit={handleConfirmActionSubmit}
        >
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
              type="button"
              aria-label="Fechar confirmação"
              disabled={isConfirmingAction}
              className={styles.confirmCloseBtn}
              onClick={() => confirmDialogRef.current?.close("cancel")}
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
                      removida definitivamente, incluindo as participações
                      vinculadas a ela. Esta ação não poderá ser desfeita.
                    </>
                  )}
                  {confirmModal?.type === "publish-one" &&
                    confirmModal.event && (
                      <>
                        A escala <strong>{confirmModal.event.title}</strong> (
                        {confirmModal.event.day} {confirmModal.event.monthShort}
                        , {confirmModal.event.time}) será publicada para os
                        participantes do ministério.
                      </>
                    )}
                  {confirmModal?.type === "publish-all" && (
                    <>
                      Todas as{" "}
                      <strong>
                        {confirmModal.count} escala(s) em rascunho
                      </strong>{" "}
                      dentro do período liberado serão publicadas para a equipe.
                    </>
                  )}
                </p>
              </div>
            </div>

            {confirmError && (
              <div className={styles.formBannerError} role="alert">
                <AlertCircleIcon className={styles.fieldErrorIcon} />
                <span>{confirmError}</span>
              </div>
            )}
          </div>

          <div className={styles.confirmFooter}>
            <button
              ref={confirmCancelBtnRef}
              type="button"
              autoFocus
              disabled={isConfirmingAction}
              className={styles.confirmCancelBtn}
              onClick={() => confirmDialogRef.current?.close("cancel")}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isConfirmingAction}
              aria-busy={isConfirmingAction}
              className={
                confirmModal?.type === "delete"
                  ? styles.confirmDangerBtn
                  : styles.confirmPrimaryBtn
              }
            >
              {isConfirmingAction
                ? "Processando..."
                : confirmModal?.type === "delete"
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
