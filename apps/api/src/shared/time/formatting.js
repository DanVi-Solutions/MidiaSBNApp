import { env } from "../../config/env.js";

const dayAndTime = new Intl.DateTimeFormat("pt-BR", {
  timeZone: env.APP_TIME_ZONE,
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatMoment(date) {
  const parts = Object.fromEntries(dayAndTime.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.weekday}, ${parts.day}/${parts.month} às ${parts.hour}:${parts.minute}`;
}

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" });
const weekdayAndDay = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  day: "2-digit",
  month: "2-digit",
  timeZone: "UTC",
});

const middayUtc = (plainDate) => new Date(Date.UTC(plainDate.year, plainDate.month - 1, plainDate.day, 12));

export const formatMonthName = (yearMonth) =>
  monthName.format(middayUtc(Temporal.PlainYearMonth.from(yearMonth).toPlainDate({ day: 1 })));

export const formatDay = (isoDate) => weekdayAndDay.format(middayUtc(Temporal.PlainDate.from(isoDate)));
