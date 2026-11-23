import { toZoned } from "./zonedTime.js";

const SUNDAY = 7;
const MINUTES_BEFORE_SERVICE = 60;

export const WORSHIP_SERVICES = Object.freeze({
  SUNDAY_0815: { start: "08:15", end: "10:00" },
  SUNDAY_1030: { start: "10:30", end: "12:00" },
  SUNDAY_1800: { start: "18:00", end: "20:00" },
});

export const WORSHIP_SERVICE_CODES = Object.keys(WORSHIP_SERVICES);

const minutesOf = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

export function conflictsWithWorship(scheduleAt, worshipService) {
  const service = WORSHIP_SERVICES[worshipService];
  if (!service) return false;

  const zoned = toZoned(scheduleAt);
  if (zoned.dayOfWeek !== SUNDAY) return false;

  const minutes = zoned.hour * 60 + zoned.minute;
  return minutes >= minutesOf(service.start) - MINUTES_BEFORE_SERVICE && minutes < minutesOf(service.end);
}
