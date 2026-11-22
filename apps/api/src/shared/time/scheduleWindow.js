import { env } from "../../config/env.js";
import { AppError } from "../errors/AppError.js";

const DAYS_BEFORE_MONTH_END_TO_RELEASE = 14;
const MONTHS_AHEAD = 2;
const SUNDAY = 7;

const toZoned = (date) => Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(env.APP_TIME_ZONE);

const startOfDay = (plainDate) => new Date(plainDate.toZonedDateTime({ timeZone: env.APP_TIME_ZONE }).epochMilliseconds);

function firstSundayOf(yearMonth) {
  const firstDay = yearMonth.toPlainDate({ day: 1 });
  return firstDay.add({ days: (SUNDAY - firstDay.dayOfWeek + 7) % 7 });
}

function cycleMonthOf(today) {
  const month = today.toPlainYearMonth();
  const releasedThisMonth = today.day > today.daysInMonth - DAYS_BEFORE_MONTH_END_TO_RELEASE;
  return releasedThisMonth ? month : month.subtract({ months: 1 });
}

export function scheduleWindow(now = new Date()) {
  const today = toZoned(now).toPlainDate();
  const cycleMonth = cycleMonthOf(today);
  const lastSunday = firstSundayOf(cycleMonth.add({ months: MONTHS_AHEAD }));
  const nextCycleMonth = cycleMonth.add({ months: 1 });

  return {
    cycleMonth: cycleMonth.toString(),
    editableFrom: now,
    editableUntil: startOfDay(lastSunday.add({ days: 1 })),
    lastEditableDay: lastSunday.toString(),
    nextReleaseOn: nextCycleMonth.toPlainDate({ day: nextCycleMonth.daysInMonth - DAYS_BEFORE_MONTH_END_TO_RELEASE + 1 }).toString(),
    purgeBefore: startOfDay(cycleMonth.toPlainDate({ day: 1 })),
  };
}

export const isInsideWindow = (date, window = scheduleWindow()) =>
  date >= window.editableFrom && date < window.editableUntil;

export function assertInsideWindow(date, window = scheduleWindow()) {
  if (isInsideWindow(date, window)) return;
  const today = toZoned(window.editableFrom).toPlainDate().toString();
  throw AppError.unprocessable(
    `Escala fora do período liberado: só é possível mexer em escalas de ${today} até ${window.lastEditableDay}`,
  );
}

export function monthsOfWindow(window = scheduleWindow()) {
  const first = toZoned(window.editableFrom).toPlainDate().toPlainYearMonth();
  const last = Temporal.PlainDate.from(window.lastEditableDay).toPlainYearMonth();
  const months = [];
  for (let month = first; Temporal.PlainYearMonth.compare(month, last) <= 0; month = month.add({ months: 1 })) {
    months.push(month.toString());
  }
  return months;
}
