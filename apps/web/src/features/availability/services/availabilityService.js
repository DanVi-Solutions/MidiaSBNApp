import { apiRequest } from "@/lib/apiClient";
import {
  addDaysIso,
  buildZonedStartOfDayIso,
  compareIsoDates,
  countInclusiveDays,
} from "@/features/availability/utils/calendarDates";
import {
  APP_TIME_ZONE,
  extractDateAndTimeInZone,
} from "@/features/schedules/utils/scheduleDates";

export const DAY_SLOTS = [
  { id: "allDay", label: "Dia inteiro", tone: "available" },
  { id: "morning", label: "Manhã", tone: "available" },
  { id: "afternoon", label: "Tarde", tone: "available" },
  { id: "evening", label: "Noite", tone: "available" },
  { id: "unavailable", label: "Indisponível", tone: "unavailable" },
];

export const WEEK_DAYS = [
  { id: "mon", apiWeekday: "MONDAY", label: "Segunda" },
  { id: "tue", apiWeekday: "TUESDAY", label: "Terça" },
  { id: "wed", apiWeekday: "WEDNESDAY", label: "Quarta" },
  { id: "thu", apiWeekday: "THURSDAY", label: "Quinta" },
  { id: "fri", apiWeekday: "FRIDAY", label: "Sexta" },
  { id: "sat", apiWeekday: "SATURDAY", label: "Sábado" },
  { id: "sun", apiWeekday: "SUNDAY", label: "Domingo" },
];

export const EMPTY_WEEKLY_AVAILABILITY = Object.freeze({
  mon: ["unavailable"],
  tue: ["unavailable"],
  wed: ["unavailable"],
  thu: ["unavailable"],
  fri: ["unavailable"],
  sat: ["unavailable"],
  sun: ["unavailable"],
});

export function mapApiWeekToUi(apiDays) {
  const daysArray = Array.isArray(apiDays) ? apiDays : [];
  const byWeekday = new Map(daysArray.map((item) => [item?.weekday, item]));
  const result = {};

  for (const day of WEEK_DAYS) {
    const entry = byWeekday.get(day.apiWeekday);
    const morning = Boolean(entry?.morning);
    const afternoon = Boolean(entry?.afternoon);
    const night = Boolean(entry?.night);

    if (morning && afternoon && night) {
      result[day.id] = ["allDay"];
    } else if (!morning && !afternoon && !night) {
      result[day.id] = ["unavailable"];
    } else {
      const slots = [];
      if (morning) slots.push("morning");
      if (afternoon) slots.push("afternoon");
      if (night) slots.push("evening");
      result[day.id] = slots;
    }
  }

  return result;
}

export function mapUiWeekToApiDays(uiWeek) {
  const days = [];

  for (const day of WEEK_DAYS) {
    const slots = Array.isArray(uiWeek?.[day.id]) ? uiWeek[day.id] : [];
    if (slots.includes("allDay")) {
      days.push({
        weekday: day.apiWeekday,
        morning: true,
        afternoon: true,
        night: true,
      });
      continue;
    }

    const morning = slots.includes("morning");
    const afternoon = slots.includes("afternoon");
    const night = slots.includes("evening");
    if (morning || afternoon || night) {
      days.push({
        weekday: day.apiWeekday,
        morning,
        afternoon,
        night,
      });
    }
  }

  return days;
}

export function buildUnavailabilityRangeIso(startDateIso, endDateIso) {
  const startAt = buildZonedStartOfDayIso(startDateIso);
  const nextDayIso = addDaysIso(endDateIso, 1);
  const endAt = buildZonedStartOfDayIso(nextDayIso);
  return { startAt, endAt };
}

export function formatUnavailabilityForUi(apiItem) {
  if (!apiItem) return null;

  const startParts = extractDateAndTimeInZone(apiItem.startAt, APP_TIME_ZONE);
  const endParts = extractDateAndTimeInZone(apiItem.endAt, APP_TIME_ZONE);
  if (!startParts.dateIso || !endParts.dateIso) return null;

  const startDate = startParts.dateIso;
  let endDate = endParts.dateIso;
  let isFullDay = false;

  if (
    endParts.time === "00:00" &&
    compareIsoDates(endParts.dateIso, startParts.dateIso) > 0
  ) {
    endDate = addDaysIso(endParts.dateIso, -1);
    isFullDay = startParts.time === "00:00";
  } else {
    isFullDay = startParts.time === "00:00" && endParts.time === "23:59";
  }

  const days = Math.max(1, countInclusiveDays(startDate, endDate));
  const mode = startDate === endDate ? "single" : "range";

  return {
    id: apiItem.id,
    mode,
    startDate,
    endDate,
    days,
    startAt: apiItem.startAt,
    endAt: apiItem.endAt,
    startTime: startParts.time,
    endTime: endParts.time,
    isFullDay,
    reason: typeof apiItem.reason === "string" ? apiItem.reason : "",
  };
}

export function sortUnavailabilities(items) {
  return [...(items || [])].sort((left, right) => {
    const startDiff = compareIsoDates(left.startDate, right.startDate);
    if (startDiff !== 0) return startDiff;
    const endDiff = compareIsoDates(left.endDate, right.endDate);
    if (endDiff !== 0) return endDiff;
    return String(left.startAt || "").localeCompare(
      String(right.startAt || "")
    );
  });
}

export function getMyWeeklyAvailability() {
  return apiRequest("/availabilities/me");
}

export function getCredentialWeeklyAvailability(credentialId) {
  return apiRequest(
    `/availabilities/credentials/${encodeURIComponent(credentialId)}`
  );
}

export function listDepartmentWeeklyAvailabilities(departmentId) {
  return apiRequest(
    `/availabilities/departments/${encodeURIComponent(departmentId)}`
  );
}

export function replaceMyWeeklyAvailability(days) {
  return apiRequest("/availabilities/me", {
    method: "PUT",
    body: { days },
  });
}

export function getMyWorshipService() {
  return apiRequest("/availabilities/me/worship-service");
}

export function saveMyWorshipService(worshipService) {
  return apiRequest("/availabilities/me/worship-service", {
    method: "PUT",
    body: { worshipService: worshipService || null },
  });
}

export function listMyUnavailabilities({ from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();
  return apiRequest(`/unavailabilities/me${query ? `?${query}` : ""}`);
}

export function listCredentialUnavailabilities(credentialId, { from, to } = {}) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();
  return apiRequest(
    `/unavailabilities/credentials/${encodeURIComponent(credentialId)}${
      query ? `?${query}` : ""
    }`
  );
}

export function listDepartmentUnavailabilities(
  departmentId,
  { from, to } = {}
) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();
  return apiRequest(
    `/unavailabilities/departments/${encodeURIComponent(departmentId)}${
      query ? `?${query}` : ""
    }`
  );
}

export function createUnavailability({ startAt, endAt, reason }) {
  const cleanReason = typeof reason === "string" ? reason.trim() : "";
  return apiRequest("/unavailabilities", {
    method: "POST",
    body: {
      startAt,
      endAt,
      ...(cleanReason ? { reason: cleanReason } : {}),
    },
  });
}

export function updateUnavailability(id, patch) {
  return apiRequest(`/unavailabilities/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
  });
}

export function deleteUnavailability(id) {
  return apiRequest(`/unavailabilities/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
