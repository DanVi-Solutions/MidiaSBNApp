import { env } from "../../config/env.js";

const MINUTE = 60 * 1000;

export const CHECK_IN_OPENS_BEFORE = 10 * MINUTE;

const localDayOf = (date) =>
  Temporal.Instant.fromEpochMilliseconds(date.getTime()).toZonedDateTimeISO(env.APP_TIME_ZONE).toPlainDate();

const startOfLocalDay = (plainDate) =>
  new Date(plainDate.toZonedDateTime({ timeZone: env.APP_TIME_ZONE }).epochMilliseconds);

const endOfLocalDay = (date) => new Date(startOfLocalDay(localDayOf(date).add({ days: 1 })).getTime() - 1);

export function checkInWindowOf(scheduleAt) {
  return {
    opensAt: new Date(scheduleAt.getTime() - CHECK_IN_OPENS_BEFORE),
    closesAt: endOfLocalDay(scheduleAt),
  };
}

export const stillCheckingIn = (now = new Date()) => startOfLocalDay(localDayOf(now));
