"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePrivateWorkspace } from "@/components/layout/PrivateWorkspaceContext";
import { useToast } from "@/components/ui/ToastProvider";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CalendarDaysIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DownloadIcon,
  ListIcon,
  MapPinIcon,
  PencilIcon,
  LinkIcon,
  PlusIcon,
  SearchIcon,
  SendIcon,
  TrashIcon,
} from "@/components/ui/icons";
import {
  deleteAgendaEvent,
  formatAgendaEventForUi,
  getAgendaWindow,
  listAgendaEvents,
  updateAgendaEvent,
} from "@/features/agenda/services/agendaService";
import {
  APP_TIME_ZONE,
  formatIsoDatePtBr,
  getTodayIsoInZone,
  MONTH_FULL_PT,
} from "@/features/schedules/utils/scheduleDates";
import {
  MAX_CALENDAR_DOTS,
  WEEKDAY_INITIALS,
  calendarCellsOf,
  groupByMonth,
  monthLabelOf,
  monthsBetween,
  normalizeSearch,
  shortMonthLabelOf,
} from "@/features/agenda/utils/agendaDates";
import styles from "./AgendaView.module.css";

const ALL_MONTHS = "all";
const PUBLIC_AGENDA_PATH = "/agenda-sobrenatural";
const PUBLIC_HINT_STORAGE_KEY = "midia_sbn_public_agenda_hint_v1";
const PUBLIC_HINT_DURATION_MS = 9000;

function usePublicAgendaHint() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    let hideTimer = null;
    const showTimer = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(PUBLIC_HINT_STORAGE_KEY)) return;
        window.localStorage.setItem(PUBLIC_HINT_STORAGE_KEY, "1");
      } catch {
        return;
      }
      setIsVisible(true);
      hideTimer = window.setTimeout(() => setIsVisible(false), PUBLIC_HINT_DURATION_MS);
    }, 600);
    return () => {
      window.clearTimeout(showTimer);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, []);

  return isVisible;
}
const VIEW_LIST = "list";
const VIEW_CALENDAR = "calendar";
function MinistryMultiSelect({ options, selectedIds, onChange }) {
  const wrapRef = useRef(null);
  const panelId = useId();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    const closeOnOutside = (event) => {
      if (!wrapRef.current?.contains(event.target)) setIsOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const label =
    selectedIds.length === 0
      ? "Todos os ministérios"
      : selectedIds.length === 1
        ? options.find((option) => option.id === selectedIds[0])?.name ||
          "1 ministério"
        : `${selectedIds.length} ministérios`;

  const toggle = (id) =>
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((each) => each !== id)
        : [...selectedIds, id],
    );

  return (
    <div ref={wrapRef} className={styles.multiSelect}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={styles.multiSelectButton}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className={styles.multiSelectLabel}>{label}</span>
        <span className={styles.multiSelectCaret} aria-hidden="true">
          ▼
        </span>
      </button>

      {isOpen && (
        <div
          id={panelId}
          className={styles.multiSelectPanel}
          role="group"
          aria-label="Filtrar por ministério"
        >
          {options.length === 0 ? (
            <p className={styles.multiSelectEmpty}>
              Nenhum ministério alocado nos eventos.
            </p>
          ) : (
            options.map((option) => (
              <label key={option.id} className={styles.multiSelectOption}>
                <input
                  type="checkbox"
                  className={styles.departmentCheckbox}
                  checked={selectedIds.includes(option.id)}
                  onChange={() => toggle(option.id)}
                />
                <span>{option.name}</span>
              </label>
            ))
          )}
          {selectedIds.length > 0 && (
            <button
              type="button"
              className={styles.multiSelectClear}
              onClick={() => onChange([])}
            >
              Mostrar todos os ministérios
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function AgendaEventCard({
  event,
  canEdit,
  isPublishing,
  onPublish,
  onEdit,
  onCancel,
}) {
  const isDraft = !event.published;
  const canChange = canEdit && !event.isPast;

  return (
    <article
      className={`${styles.agendaCard} ${isDraft ? styles.agendaCardDraft : ""} ${
        event.isPast ? styles.agendaCardPast : ""
      }`}
    >
      <div className={styles.dateColumn}>
        <span className={styles.dateDay}>{event.day}</span>
        <span className={styles.dateMonth}>{event.monthShort}</span>
        <span className={styles.dateWeekday}>{event.weekdayFull}</span>
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardTopRow}>
          <h3 className={styles.cardTitle}>{event.name}</h3>
          <div className={styles.cardBadges}>
            {event.isPast && <span className={styles.pastTag}>Realizado</span>}
            {isDraft && (
              <span className={styles.draftPill}>
                <span className={styles.statusDot} aria-hidden="true" />
                Rascunho
              </span>
            )}
            {canChange && (
              <div className={styles.cardActions}>
                <button
                  type="button"
                  aria-label={`Editar ${event.name}`}
                  title="Editar evento"
                  className={styles.cardIconAction}
                  onClick={() => onEdit(event)}
                >
                  <PencilIcon />
                </button>
                <button
                  type="button"
                  aria-label={`Cancelar ${event.name}`}
                  title={isDraft ? "Excluir rascunho" : "Cancelar evento"}
                  className={styles.cardIconActionDanger}
                  onClick={() => onCancel(event)}
                >
                  <TrashIcon />
                </button>
              </div>
            )}
          </div>
        </div>

        <div className={styles.cardMeta}>
          <span className={styles.cardMetaItem}>
            <ClockIcon />
            {event.time}
          </span>
          {event.location && (
            <span className={styles.cardMetaItem}>
              <MapPinIcon />
              {event.location}
            </span>
          )}
        </div>

        {event.description && (
          <p className={styles.cardDescription}>{event.description}</p>
        )}

        {(event.departments.length > 0 || (isDraft && canChange)) && (
          <div className={styles.cardFooterRow}>
            {event.departments.length > 0 && (
              <ul
                className={styles.ministryList}
                aria-label={`Ministérios de ${event.name}`}
              >
                {event.departments.map((department) => (
                  <li
                    key={department.id}
                    className={
                      canEdit && department.scheduled
                        ? styles.ministryChipScheduled
                        : styles.ministryChip
                    }
                    title={
                      canEdit
                        ? department.scheduled
                          ? "Escala criada"
                          : isDraft
                            ? "A escala será criada depois que o evento for publicado"
                            : "A escala será criada quando a data entrar no período das escalas"
                        : undefined
                    }
                  >
                    {canEdit && department.scheduled && <CheckIcon />}
                    {department.name}
                  </li>
                ))}
              </ul>
            )}

            {isDraft && canChange && (
              <button
                type="button"
                className={styles.publishButton}
                disabled={isPublishing}
                aria-busy={isPublishing}
                onClick={() => onPublish(event)}
              >
                <SendIcon />
                <span>{isPublishing ? "Publicando..." : "Publicar"}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

export function AgendaView() {
  const {
    openWorkspaceDrawer,
    notifySchedulesChanged,
    broadcastWorkspaceSync,
    syncVersion,
  } = usePrivateWorkspace();
  const toast = useToast();

  const searchInputId = useId();
  const monthFilterId = useId();
  const cancelTitleId = useId();
  const cancelDescId = useId();
  const cancelDialogRef = useRef(null);
  const todayIso = useMemo(() => getTodayIsoInZone(APP_TIME_ZONE), []);
  const currentMonthKey = todayIso.slice(0, 7);

  const [agendaWindow, setAgendaWindow] = useState(null);
  const [events, setEvents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState(currentMonthKey);
  const [ministryFilter, setMinistryFilter] = useState([]);
  const [view, setView] = useState(VIEW_LIST);
  const [selectedDay, setSelectedDay] = useState(null);

  const isPublicHintVisible = usePublicAgendaHint();
  const [publishingId, setPublishingId] = useState(null);
  const [pendingCancel, setPendingCancel] = useState(null);
  const [cancelError, setCancelError] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  const loadAgenda = useCallback(async () => {
    const [windowResult, eventsResult] = await Promise.all([
      getAgendaWindow(),
      listAgendaEvents(),
    ]);
    setIsLoading(false);

    if (!windowResult.ok || !eventsResult.ok) {
      setLoadError(
        windowResult.error ||
          eventsResult.error ||
          "Não foi possível carregar a agenda.",
      );
      return;
    }
    setLoadError("");
    setAgendaWindow(windowResult.data);
    const now = new Date();
    setEvents(
      (eventsResult.data || []).map((item) =>
        formatAgendaEventForUi(item, now),
      ),
    );
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadAgenda, 0);
    return () => window.clearTimeout(timer);
  }, [loadAgenda, syncVersion]);

  const canEdit = Boolean(agendaWindow?.canEdit);

  const monthOptions = useMemo(() => {
    if (!agendaWindow) return [];
    return monthsBetween(
      `${agendaWindow.cycleYear}-01`,
      agendaWindow.lastEditableDay.slice(0, 7),
    );
  }, [agendaWindow]);

  const ministryOptions = useMemo(() => {
    const byId = new Map();
    for (const event of events) {
      for (const department of event.departments)
        byId.set(department.id, department);
    }
    return [...byId.values()].sort((a, b) =>
      a.name.localeCompare(b.name, "pt-BR"),
    );
  }, [events]);

  const effectiveMonth =
    monthFilter === ALL_MONTHS || monthOptions.includes(monthFilter)
      ? monthFilter
      : ALL_MONTHS;
  const calendarMonth =
    effectiveMonth === ALL_MONTHS ? currentMonthKey : effectiveMonth;

  const matchingEvents = useMemo(() => {
    const query = normalizeSearch(searchQuery);
    return events.filter(
      (event) =>
        (!query || normalizeSearch(event.name).includes(query)) &&
        (ministryFilter.length === 0 ||
          event.departmentIds.some((id) => ministryFilter.includes(id))),
    );
  }, [events, searchQuery, ministryFilter]);

  const listMonths = useMemo(
    () =>
      groupByMonth(
        effectiveMonth === ALL_MONTHS
          ? matchingEvents
          : matchingEvents.filter((event) => event.monthKey === effectiveMonth),
      ),
    [matchingEvents, effectiveMonth],
  );

  const eventsByDay = useMemo(() => {
    const byDay = new Map();
    for (const event of matchingEvents) {
      if (event.monthKey !== calendarMonth) continue;
      if (!byDay.has(event.dateIso)) byDay.set(event.dateIso, []);
      byDay.get(event.dateIso).push(event);
    }
    return byDay;
  }, [matchingEvents, calendarMonth]);

  const defaultDay = todayIso.startsWith(calendarMonth)
    ? todayIso
    : [...eventsByDay.keys()].sort()[0] || null;
  const activeDay = selectedDay?.startsWith(calendarMonth)
    ? selectedDay
    : defaultDay;
  const activeDayEvents = activeDay ? eventsByDay.get(activeDay) || [] : [];

  const calendarIndex = monthOptions.indexOf(calendarMonth);
  const goToMonth = (offset) => {
    const target = monthOptions[calendarIndex + offset];
    if (target) {
      setMonthFilter(target);
      setSelectedDay(null);
    }
  };

  const refreshAfterChange = async () => {
    await loadAgenda();
    notifySchedulesChanged();
    broadcastWorkspaceSync();
  };

  const openCreate = () => {
    if (!canEdit) return;
    openWorkspaceDrawer("agenda-event-form", {
      mode: "create",
      window: agendaWindow,
      onSaved: loadAgenda,
    });
  };

  const openExport = () => {
    openWorkspaceDrawer("agenda-export", {
      events,
      monthOptions,
      defaultMonth:
        effectiveMonth === ALL_MONTHS ? currentMonthKey : effectiveMonth,
    });
  };

  const openEdit = (event) => {
    if (!canEdit || event.isPast) return;
    openWorkspaceDrawer("agenda-event-form", {
      mode: "edit",
      event,
      window: agendaWindow,
      onSaved: loadAgenda,
    });
  };

  const handlePublish = async (event) => {
    if (publishingId) return;
    setPublishingId(event.id);
    const result = await updateAgendaEvent(event.id, { published: true });
    setPublishingId(null);
    if (!result.ok) {
      toast.error(result.error || "Não foi possível publicar o evento.");
      return;
    }
    await refreshAfterChange();
    toast.success(`Evento "${event.name}" publicado.`);
  };

  const openCancel = (event) => {
    const dialog = cancelDialogRef.current;
    if (!dialog || dialog.open || !canEdit || event.isPast) return;
    setPendingCancel(event);
    setCancelError("");
    setIsCancelling(false);
    dialog.showModal();
  };

  const handleCancelConfirm = async (submitEvent) => {
    submitEvent.preventDefault();
    if (!pendingCancel || isCancelling) return;

    setIsCancelling(true);
    const result = await deleteAgendaEvent(pendingCancel.id);
    setIsCancelling(false);

    if (!result.ok) {
      setCancelError(
        result.error || "Não foi possível cancelar o evento. Tente novamente.",
      );
      return;
    }

    const cancelled = pendingCancel;
    cancelDialogRef.current?.close("confirm");
    await refreshAfterChange();
    toast.success(
      cancelled.published
        ? `Evento "${cancelled.name}" cancelado.`
        : `Rascunho "${cancelled.name}" excluído.`,
    );
  };

  const renderCard = (event) => (
    <AgendaEventCard
      key={event.id}
      event={event}
      canEdit={canEdit}
      isPublishing={publishingId === event.id}
      onPublish={handlePublish}
      onEdit={openEdit}
      onCancel={openCancel}
    />
  );

  const viewToggle = (
    <div
      className={styles.viewToggle}
      role="group"
      aria-label="Modo de visualização"
    >
      <button
        type="button"
        aria-pressed={view === VIEW_LIST}
        aria-label="Ver em lista"
        title="Lista"
        className={styles.viewToggleButton}
        onClick={() => setView(VIEW_LIST)}
      >
        <ListIcon />
      </button>
      <button
        type="button"
        aria-pressed={view === VIEW_CALENDAR}
        aria-label="Ver em calendário"
        title="Calendário"
        className={styles.viewToggleButton}
        onClick={() => setView(VIEW_CALENDAR)}
      >
        <CalendarDaysIcon />
      </button>
    </div>
  );

  const hasActiveFilters =
    Boolean(searchQuery.trim()) || ministryFilter.length > 0;
  const pendingHasSchedules = Boolean(
    pendingCancel?.departments.some((department) => department.scheduled),
  );

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div className={styles.headerLead}>
          <p className={styles.pageEyebrow}>PROGRAMAÇÃO ANUAL</p>
          <div className={styles.titleRow}>
            <h1 className={styles.pageTitle}>Agenda Sobrenatural</h1>
            <span className={styles.publicLinkWrap}>
              <a
                href={PUBLIC_AGENDA_PATH}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir a página pública da agenda em outra aba"
                title="Página pública da agenda"
                className={styles.publicLink}
              >
                <LinkIcon />
              </a>
              {isPublicHintVisible && (
                <span role="status" className={styles.publicHint}>
                  A agenda também tem uma <strong>página pública</strong>, aberta para qualquer pessoa. Clique no ícone
                  para abri-la.
                </span>
              )}
            </span>
          </div>
          <p className={styles.pageSubtitle}>
            {canEdit
              ? "Marque os eventos do ano e indique os ministérios que vão servir em cada um."
              : "Veja os eventos do ano e os ministérios que vão servir em cada um."}
          </p>
        </div>

        {agendaWindow && (
          <div className={styles.headerActions}>
            {canEdit && (
              <button
                type="button"
                className={styles.createButton}
                onClick={openCreate}
              >
                <PlusIcon />
                <span>Novo evento</span>
              </button>
            )}
            <button
              type="button"
              className={styles.exportButton}
              onClick={openExport}
            >
              <DownloadIcon />
              <span>Exportar agenda</span>
            </button>
          </div>
        )}
      </header>

      {isLoading && !agendaWindow ? (
        <div className={styles.emptyState} role="status">
          <p className={styles.emptyTitle}>Carregando a agenda...</p>
        </div>
      ) : loadError && !agendaWindow ? (
        <div className={styles.restrictedCard} role="alert">
          <p className={styles.restrictedTitle}>{loadError}</p>
          <button
            type="button"
            className={styles.retryButton}
            onClick={() => {
              setIsLoading(true);
              loadAgenda();
            }}
          >
            Tentar novamente
          </button>
        </div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <search aria-label="Buscar eventos" className={styles.searchWrap}>
              <label htmlFor={searchInputId} className="visually-hidden">
                Buscar evento
              </label>
              <SearchIcon className={styles.searchIcon} />
              <input
                id={searchInputId}
                type="search"
                value={searchQuery}
                placeholder="Buscar evento pelo nome..."
                className={styles.searchInput}
                onChange={(changeEvent) =>
                  setSearchQuery(changeEvent.currentTarget.value)
                }
              />
            </search>

            <div className={styles.toolbarFilters}>
              <div className={styles.filterWrap}>
                <label htmlFor={monthFilterId} className="visually-hidden">
                  Filtrar por mês
                </label>
                <select
                  id={monthFilterId}
                  value={effectiveMonth}
                  className={styles.filterSelect}
                  onChange={(changeEvent) => {
                    setMonthFilter(changeEvent.currentTarget.value);
                    setSelectedDay(null);
                  }}
                >
                  <option value={ALL_MONTHS}>Todos os meses</option>
                  {monthOptions.map((monthKey) => (
                    <option key={monthKey} value={monthKey}>
                      {shortMonthLabelOf(monthKey)}
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.filterWrap}>
                <MinistryMultiSelect
                  options={ministryOptions}
                  selectedIds={ministryFilter}
                  onChange={setMinistryFilter}
                />
              </div>
            </div>
          </div>

          {canEdit && agendaWindow?.lastEditableDay && (
            <p className={styles.windowHint}>
              Eventos podem ser marcados até{" "}
              {formatIsoDatePtBr(agendaWindow.lastEditableDay)}.
              {agendaWindow.cycles?.length === 1 &&
                ` O próximo ano será liberado em ${formatIsoDatePtBr(agendaWindow.nextReleaseOn)}.`}
            </p>
          )}

          {view === VIEW_CALENDAR ? (
            <div className={styles.viewSection}>
              <div className={styles.viewRow}>{viewToggle}</div>
              <section
                className={styles.calendarSection}
                aria-label="Calendário da agenda"
              >
                <div className={styles.calendarColumn}>
                  <div className={styles.calendar}>
                    <div className={styles.calendarHeader}>
                      <button
                        type="button"
                        aria-label="Mês anterior"
                        className={styles.calendarNavButton}
                        disabled={calendarIndex <= 0}
                        onClick={() => goToMonth(-1)}
                      >
                        <ChevronLeftIcon />
                      </button>
                      <h2 className={styles.calendarTitle}>
                        {monthLabelOf(calendarMonth)}
                      </h2>
                      <button
                        type="button"
                        aria-label="Próximo mês"
                        className={styles.calendarNavButton}
                        disabled={
                          calendarIndex < 0 ||
                          calendarIndex >= monthOptions.length - 1
                        }
                        onClick={() => goToMonth(1)}
                      >
                        <ChevronRightIcon />
                      </button>
                    </div>

                    <div className={styles.calendarGrid}>
                      {WEEKDAY_INITIALS.map((initial, index) => (
                        <span
                          key={index}
                          className={styles.calendarWeekday}
                          aria-hidden="true"
                        >
                          {initial}
                        </span>
                      ))}
                      {calendarCellsOf(calendarMonth).map((dayIso, index) => {
                        if (!dayIso)
                          return (
                            <span key={`blank-${index}`} aria-hidden="true" />
                          );
                        const dayEvents = eventsByDay.get(dayIso) || [];
                        const dayNumber = Number(dayIso.slice(8));
                        return (
                          <button
                            key={dayIso}
                            type="button"
                            aria-pressed={dayIso === activeDay}
                            aria-label={`${dayNumber} de ${MONTH_FULL_PT[Number(dayIso.slice(5, 7)) - 1]}${
                              dayEvents.length > 0
                                ? `, ${dayEvents.length} ${dayEvents.length === 1 ? "evento" : "eventos"}`
                                : ""
                            }`}
                            className={`${styles.calendarDay} ${dayIso === todayIso ? styles.calendarDayToday : ""} ${
                              dayIso < todayIso ? styles.calendarDayPast : ""
                            }`}
                            onClick={() => setSelectedDay(dayIso)}
                          >
                            <span className={styles.calendarDayNumber}>
                              {dayNumber}
                            </span>
                            <span
                              className={styles.calendarDots}
                              aria-hidden="true"
                            >
                              {dayEvents.slice(0, MAX_CALENDAR_DOTS).map((event) => (
                                <span
                                  key={event.id}
                                  className={
                                    event.published
                                      ? styles.calendarDot
                                      : styles.calendarDotDraft
                                  }
                                />
                              ))}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className={styles.dayEvents}>
                  <div className={styles.monthHeadingRow}>
                    <h3 className={styles.monthHeading}>
                      {activeDay
                        ? formatIsoDatePtBr(activeDay)
                        : "Selecione um dia"}
                      {activeDay && (
                        <span className={styles.monthCount}>
                          {activeDayEvents.length}{" "}
                          {activeDayEvents.length === 1 ? "evento" : "eventos"}
                        </span>
                      )}
                    </h3>
                  </div>
                  {activeDay && activeDayEvents.length === 0 ? (
                    <p className={styles.dayEmpty}>Nenhum evento neste dia.</p>
                  ) : (
                    <div className={styles.monthList}>
                      {activeDayEvents.map(renderCard)}
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : listMonths.length === 0 ? (
            <div className={styles.viewSection}>
              <div className={styles.viewRow}>{viewToggle}</div>
              <section className={styles.emptyState} aria-label="Nenhum evento">
                <span className={styles.emptyIconBadge} aria-hidden="true">
                  <CalendarDaysIcon />
                </span>
                <h2 className={styles.emptyTitle}>
                  {hasActiveFilters
                    ? "Nenhum evento encontrado"
                    : effectiveMonth === ALL_MONTHS
                      ? "Nenhum evento na agenda"
                      : `Nenhum evento em ${monthLabelOf(effectiveMonth)}`}
                </h2>
                <p className={styles.emptyDesc}>
                  {hasActiveFilters
                    ? "Revise a busca ou os filtros selecionados."
                    : canEdit
                      ? "Use o botão Novo evento para marcar os eventos do ano."
                      : "Os eventos marcados pela liderança aparecem aqui."}
                </p>
              </section>
            </div>
          ) : (
            <div className={styles.months}>
              {listMonths.map((month, index) => (
                <section
                  key={month.monthKey}
                  className={styles.monthSection}
                  aria-label={month.label}
                >
                  <div className={styles.monthHeadingRow}>
                    <h2 className={styles.monthHeading}>
                      {month.label}
                      <span className={styles.monthCount}>
                        {month.items.length}{" "}
                        {month.items.length === 1 ? "evento" : "eventos"}
                      </span>
                    </h2>
                    {index === 0 && viewToggle}
                  </div>
                  <div className={styles.monthList}>
                    {month.items.map(renderCard)}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      <dialog
        ref={cancelDialogRef}
        closedby="any"
        aria-labelledby={cancelTitleId}
        aria-describedby={cancelDescId}
        className={styles.modalDialog}
        onCancel={(cancelEvent) => {
          if (isCancelling) cancelEvent.preventDefault();
        }}
        onClose={() => {
          setPendingCancel(null);
          setCancelError("");
        }}
      >
        <form className={styles.modalForm} onSubmit={handleCancelConfirm}>
          <div className={styles.deleteModalLead}>
            <span className={styles.deleteModalBadge} aria-hidden="true">
              <AlertTriangleIcon />
            </span>
            <div>
              <h2 id={cancelTitleId} className={styles.modalTitle}>
                {pendingCancel?.published
                  ? "Cancelar evento?"
                  : "Excluir rascunho?"}
              </h2>
              <p id={cancelDescId} className={styles.modalSubtitle}>
                <strong>{pendingCancel?.name}</strong> sai da agenda.
                {pendingHasSchedules &&
                  " As escalas geradas por ele serão apagadas, e quem estava escalado será avisado."}
              </p>
            </div>
          </div>

          {cancelError && (
            <div className={styles.formBannerError} role="alert">
              <AlertCircleIcon className={styles.errorIcon} />
              <span>{cancelError}</span>
            </div>
          )}

          <div className={styles.modalActions}>
            <button
              type="button"
              autoFocus
              disabled={isCancelling}
              className={styles.modalCancelButton}
              onClick={() => cancelDialogRef.current?.close("cancel")}
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={isCancelling}
              aria-busy={isCancelling}
              className={styles.modalDangerButton}
            >
              {isCancelling
                ? "Excluindo..."
                : pendingCancel?.published
                  ? "Cancelar evento"
                  : "Excluir rascunho"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
