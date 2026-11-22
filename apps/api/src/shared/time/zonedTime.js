import { env } from "../../config/env.js";

export const WEEKDAYS = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"];

const NOON = 12;
const EVENING = 18;

const toZoned = (date) => Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(env.APP_TIME_ZONE);

const weekdayOfZoned = (zoned) => WEEKDAYS[zoned.dayOfWeek % 7];

export const localDateOf = (date) => toZoned(date).toPlainDate().toString();

export function weekdayAndPeriodOf(date) {
  const zoned = toZoned(date);
  const period = zoned.hour < NOON ? "morning" : zoned.hour < EVENING ? "afternoon" : "night";
  return { weekday: weekdayOfZoned(zoned), period };
}

export function occurrencesInMonth(yearMonth, weekday, times) {
  const month = Temporal.PlainYearMonth.from(yearMonth);
  const occurrences = [];

  for (let day = 1; day <= month.daysInMonth; day++) {
    const date = month.toPlainDate({ day });
    if (WEEKDAYS[date.dayOfWeek % 7] !== weekday) continue;

    for (const time of times) {
      const zoned = date.toZonedDateTime({ timeZone: env.APP_TIME_ZONE, plainTime: Temporal.PlainTime.from(time) });
      occurrences.push(new Date(zoned.epochMilliseconds));
    }
  }
  return occurrences;
}
