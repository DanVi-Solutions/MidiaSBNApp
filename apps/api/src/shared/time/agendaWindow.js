import { env } from "../../config/env.js";
import { AppError } from "../errors/AppError.js";
import { toZoned } from "./zonedTime.js";

const RELEASE_MONTH = 11;
const DAYS_BEFORE_MONTH_END_TO_RELEASE = 14;
const SUNDAY = 7;

const startOfDay = (plainDate) => new Date(plainDate.toZonedDateTime({ timeZone: env.APP_TIME_ZONE }).epochMilliseconds);

const firstDayOf = (year) => Temporal.PlainDate.from({ year, month: 1, day: 1 });

function firstSundayOfJanuary(year) {
  const firstDay = firstDayOf(year);
  return firstDay.add({ days: (SUNDAY - firstDay.dayOfWeek + 7) % 7 });
}

function releaseDayOf(year) {
  const november = Temporal.PlainYearMonth.from({ year, month: RELEASE_MONTH });
  return november.toPlainDate({ day: november.daysInMonth - DAYS_BEFORE_MONTH_END_TO_RELEASE + 1 });
}

const isOnOrBefore = (date, limit) => Temporal.PlainDate.compare(date, limit) <= 0;

const cycleYearOf = (today) => (isOnOrBefore(today, firstSundayOfJanuary(today.year)) ? today.year - 1 : today.year);

export function agendaCycle(year) {
  return { year, from: firstDayOf(year).toString(), until: firstSundayOfJanuary(year + 1).toString() };
}

export function agendaCycleRange(year) {
  return {
    from: startOfDay(firstDayOf(year)),
    until: startOfDay(firstSundayOfJanuary(year + 1).add({ days: 1 })),
  };
}

export function agendaWindow(now = new Date()) {
  const today = toZoned(now).toPlainDate();
  const cycleYear = cycleYearOf(today);
  const nextCycleReleased = !isOnOrBefore(today, releaseDayOf(cycleYear).subtract({ days: 1 }));
  const years = nextCycleReleased ? [cycleYear, cycleYear + 1] : [cycleYear];
  const lastEditableDay = firstSundayOfJanuary(years.at(-1) + 1);

  return {
    cycleYear,
    cycles: years.map(agendaCycle),
    editableFrom: now,
    editableUntil: startOfDay(lastEditableDay.add({ days: 1 })),
    lastEditableDay: lastEditableDay.toString(),
    nextReleaseOn: releaseDayOf(nextCycleReleased ? cycleYear + 1 : cycleYear).toString(),
    visibleFrom: startOfDay(firstDayOf(cycleYear)),
    purgeBefore: startOfDay(firstDayOf(cycleYear)),
  };
}

export function assertInsideAgendaWindow(date, window = agendaWindow()) {
  if (date < window.editableFrom) {
    throw AppError.unprocessable("Não é possível registrar eventos em datas que já passaram");
  }
  if (date >= window.editableUntil) {
    throw AppError.unprocessable(`A agenda está liberada até ${window.lastEditableDay}`);
  }
}
