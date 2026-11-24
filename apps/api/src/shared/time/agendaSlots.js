import { env } from "../../config/env.js";

export const SCHEDULE_LEAD_MINUTES = 60;

export function slotInstant(dateIso, time) {
  const zoned = Temporal.PlainDate.from(dateIso).toZonedDateTime({
    timeZone: env.APP_TIME_ZONE,
    plainTime: Temporal.PlainTime.from(time),
  });
  return new Date(zoned.epochMilliseconds);
}

export const scheduleAtForSlot = (dateIso, time) =>
  new Date(slotInstant(dateIso, time).getTime() - SCHEDULE_LEAD_MINUTES * 60 * 1000);
