"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  CalendarDaysIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ListIcon,
  SearchIcon,
  ShareIcon,
} from "@/components/ui/icons";
import { useToast } from "@/components/ui/ToastProvider";
import {
  formatAgendaEventForUi,
  getPublicAgenda,
} from "@/features/agenda/services/agendaService";
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
import {
  APP_TIME_ZONE,
  formatIsoDatePtBr,
  getTodayIsoInZone,
  MONTH_FULL_PT,
  WEEKDAY_FULL_PT,
  getWeekdayIndex,
} from "@/features/schedules/utils/scheduleDates";
import styles from "./PublicAgendaView.module.css";

const ALL_MONTHS = "all";
const VIEW_LIST = "list";
const VIEW_CALENDAR = "calendar";
const CHURCH_NAME = "Igreja Batista Sobrenatural";
const PUBLIC_AGENDA_PATH = "/agenda-sobrenatural";

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function ShareButton() {
  const toast = useToast();

  const handleShare = async () => {
    const url = `${window.location.origin}${PUBLIC_AGENDA_PATH}`;
    const shareData = {
      title: "Agenda Sobrenatural",
      text: `Confira a agenda de eventos da ${CHURCH_NAME}.`,
      url,
    };
    if (
      navigator.share &&
      (!navigator.canShare || navigator.canShare(shareData))
    ) {
      try {
        await navigator.share(shareData);
        return;
      } catch (error) {
        if (error?.name === "AbortError") return;
      }
    }
    if (await copyText(url)) {
      toast.success("Link da agenda copiado.");
    } else {
      toast.error(`Não foi possível copiar. Link: ${url}`);
    }
  };

  return (
    <button
      type="button"
      className={styles.shareButton}
      aria-label="Compartilhar a agenda"
      title="Compartilhar a agenda"
      onClick={handleShare}
    >
      <ShareIcon />
    </button>
  );
}

function EventRow({ event }) {
  return (
    <li
      className={`${styles.eventRow} ${event.isPast ? styles.eventRowPast : ""}`}
    >
      <div className={styles.eventDate} aria-hidden="true">
        <span className={styles.eventDay}>{event.day}</span>
        <span className={styles.eventWeekday}>{event.weekdayFull}</span>
      </div>
      <div className={styles.eventInfo}>
        <h3 className={styles.eventName}>
          <span className="visually-hidden">{event.fullDateLabel}, </span>
          {event.name}
        </h3>
        <p className={styles.eventWhen}>
          <span>{event.timesLabel}</span>
          {event.location && <span>{event.location}</span>}
          {event.isPast && (
            <span className={styles.pastNote}>Já aconteceu</span>
          )}
        </p>
        {event.description && (
          <p className={styles.eventDescription}>{event.description}</p>
        )}
      </div>
    </li>
  );
}

export function PublicAgendaView({ fontClassName = "" }) {
  const searchInputId = useId();
  const monthFilterId = useId();
  const todayIso = useMemo(() => getTodayIsoInZone(APP_TIME_ZONE), []);
  const currentMonthKey = todayIso.slice(0, 7);

  const [agenda, setAgenda] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [monthFilter, setMonthFilter] = useState(currentMonthKey);
  const [view, setView] = useState(VIEW_CALENDAR);
  const [selectedDay, setSelectedDay] = useState(null);

  const loadAgenda = useCallback(async () => {
    const result = await getPublicAgenda();
    if (!result.ok || !result.data) {
      setLoadError(result.error || "Não foi possível carregar a agenda.");
      return;
    }
    setLoadError("");
    const now = new Date();
    setAgenda({
      ...result.data,
      events: result.data.events.map((event) =>
        formatAgendaEventForUi(
          { ...event, published: true, departments: [] },
          now,
        ),
      ),
    });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadAgenda, 0);
    return () => window.clearTimeout(timer);
  }, [loadAgenda]);

  const events = useMemo(() => agenda?.events ?? [], [agenda]);
  const monthOptions = useMemo(
    () =>
      agenda
        ? monthsBetween(
            `${agenda.cycleYear}-01`,
            agenda.lastEditableDay.slice(0, 7),
          )
        : [],
    [agenda],
  );

  const effectiveMonth =
    monthFilter === ALL_MONTHS || monthOptions.includes(monthFilter)
      ? monthFilter
      : ALL_MONTHS;
  const calendarMonth =
    effectiveMonth === ALL_MONTHS ? currentMonthKey : effectiveMonth;

  const matchingEvents = useMemo(() => {
    const query = normalizeSearch(searchQuery);
    return query
      ? events.filter((event) => normalizeSearch(event.name).includes(query))
      : events;
  }, [events, searchQuery]);

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

  const hasQuery = Boolean(searchQuery.trim());

  return (
    <div className={`${styles.page} ${fontClassName}`}>
      <div className={styles.aurora} aria-hidden="true">
        <span className={styles.glowBlue} />
        <span className={styles.glowOrange} />
        <span className={styles.glowPink} />
      </div>

      <header className={styles.topbarShell}>
        <div className={styles.topbar}>
          <Link
            href={PUBLIC_AGENDA_PATH}
            className={styles.brand}
            aria-label={CHURCH_NAME}
          >
            <Image
              src="/brand/logo-mark.svg"
              alt=""
              width={40}
              height={40}
              priority
              className={styles.brandMark}
            />
            <span className={styles.brandName}>{CHURCH_NAME}</span>
          </Link>
          <Link href="/agenda" className={styles.accessButton}>
            Acessar sistema
          </Link>
        </div>
      </header>

      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="public-agenda-title">
          <h1 id="public-agenda-title" className={styles.title}>
            <span className={styles.titleLead}>Agenda</span>
            <span className={styles.titleGlow}>Sobrenatural</span>
          </h1>
          <p className={styles.lede}>
            Cultos especiais, conferências e encontros da igreja ao longo do
            ano.
          </p>
        </section>

        <div className={styles.toolbar}>
          <search aria-label="Buscar eventos" className={styles.search}>
            <label htmlFor={searchInputId} className="visually-hidden">
              Buscar evento
            </label>
            <SearchIcon className={styles.searchIcon} />
            <input
              id={searchInputId}
              type="search"
              value={searchQuery}
              placeholder="Buscar evento pelo nome"
              className={styles.searchInput}
              onChange={(changeEvent) =>
                setSearchQuery(changeEvent.currentTarget.value)
              }
            />
          </search>

          <div className={styles.toolbarActions}>
            <label htmlFor={monthFilterId} className="visually-hidden">
              Mês
            </label>
            <select
              id={monthFilterId}
              value={effectiveMonth}
              className={styles.monthSelect}
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

            <div
              className={styles.viewToggle}
              role="group"
              aria-label="Modo de visualização"
            >
              <button
                type="button"
                aria-pressed={view === VIEW_CALENDAR}
                aria-label="Ver em calendário"
                title="Calendário"
                className={styles.viewButton}
                onClick={() => setView(VIEW_CALENDAR)}
              >
                <CalendarDaysIcon />
              </button>
              <button
                type="button"
                aria-pressed={view === VIEW_LIST}
                aria-label="Ver em lista"
                title="Lista"
                className={styles.viewButton}
                onClick={() => setView(VIEW_LIST)}
              >
                <ListIcon />
              </button>
            </div>
          </div>
        </div>

        {!agenda ? (
          <div
            className={styles.statePanel}
            role={loadError ? "alert" : "status"}
          >
            {loadError ? (
              <>
                <p>{loadError}</p>
                <button
                  type="button"
                  className={styles.retryButton}
                  onClick={loadAgenda}
                >
                  Tentar de novo
                </button>
              </>
            ) : (
              <p>Carregando a agenda…</p>
            )}
          </div>
        ) : view === VIEW_CALENDAR ? (
          <div className={styles.calendarLayout}>
            <section
              className={styles.calendarPanel}
              aria-label={`Calendário de ${monthLabelOf(calendarMonth)}`}
            >
              <div className={styles.calendarHeader}>
                <button
                  type="button"
                  aria-label="Mês anterior"
                  className={styles.navButton}
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
                  className={styles.navButton}
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
                    className={styles.weekday}
                    aria-hidden="true"
                  >
                    {initial}
                  </span>
                ))}
                {calendarCellsOf(calendarMonth).map((dayIso, index) => {
                  if (!dayIso)
                    return <span key={`blank-${index}`} aria-hidden="true" />;
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
                      className={`${styles.day} ${dayIso === todayIso ? styles.dayToday : ""} ${
                        dayIso < todayIso ? styles.dayPast : ""
                      }`}
                      onClick={() => setSelectedDay(dayIso)}
                    >
                      <span>{dayNumber}</span>
                      <span className={styles.dots} aria-hidden="true">
                        {dayEvents.slice(0, MAX_CALENDAR_DOTS).map((event) => (
                          <span key={event.id} className={styles.dot} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className={styles.dayPanel} aria-live="polite">
              <h2 className={styles.dayTitle}>
                {activeDay
                  ? `${WEEKDAY_FULL_PT[getWeekdayIndex(activeDay)]}, ${formatIsoDatePtBr(activeDay)}`
                  : "Escolha um dia no calendário"}
              </h2>
              {activeDayEvents.length > 0 ? (
                <ol className={styles.eventList}>
                  {activeDayEvents.map((event) => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </ol>
              ) : (
                <p className={styles.dayEmpty}>
                  {activeDay
                    ? "Nenhum evento neste dia."
                    : "Os dias com um ponto colorido têm eventos."}
                </p>
              )}
            </section>
          </div>
        ) : listMonths.length === 0 ? (
          <div className={styles.statePanel}>
            <p>
              {hasQuery
                ? `Nenhum evento encontrado para "${searchQuery.trim()}".`
                : effectiveMonth === ALL_MONTHS
                  ? "Ainda não há eventos na agenda."
                  : `Nenhum evento em ${monthLabelOf(effectiveMonth)}.`}
            </p>
          </div>
        ) : (
          <div className={styles.months}>
            {listMonths.map((month) => (
              <section
                key={month.monthKey}
                className={styles.monthPanel}
                aria-label={month.label}
              >
                <h2 className={styles.monthTitle}>
                  {month.label}
                  <span className={styles.monthCount}>
                    {month.items.length}{" "}
                    {month.items.length === 1 ? "evento" : "eventos"}
                  </span>
                </h2>
                <ol className={styles.eventList}>
                  {month.items.map((event) => (
                    <EventRow key={event.id} event={event} />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </main>

      <footer className={styles.footer}>
        <p>{CHURCH_NAME}</p>
      </footer>

      <ShareButton />
    </div>
  );
}
