import { apiRequest } from "@/lib/apiClient";
import {
  buildIsoDateTimeInZone,
  extractDateAndTimeInZone,
  formatScheduleDateDisplay,
} from "@/features/schedules/utils/scheduleDates";

export function formatTimesLabel(times) {
  if (times.length <= 1) return times[0] ?? "";
  return `${times.slice(0, -1).join(", ")} e ${times.at(-1)}`;
}

export function getAgendaWindow() {
  return apiRequest("/agenda/window");
}

export function getPublicAgenda() {
  return apiRequest("/agenda/public", { auth: false });
}

export function listAgendaEvents({ year } = {}) {
  return apiRequest(year ? `/agenda?year=${year}` : "/agenda");
}

export function createAgendaEvent(body) {
  return apiRequest("/agenda", { method: "POST", body });
}

export function updateAgendaEvent(id, patch) {
  return apiRequest(`/agenda/${id}`, { method: "PATCH", body: patch });
}

export function deleteAgendaEvent(id) {
  return apiRequest(`/agenda/${id}`, { method: "DELETE" });
}

export function formatAgendaEventForUi(apiEvent, now = new Date()) {
  if (!apiEvent) return null;
  const startsAtLocal = extractDateAndTimeInZone(apiEvent.startsAt);
  const dateIso = apiEvent.date || startsAtLocal.dateIso;
  const times = Array.isArray(apiEvent.times) && apiEvent.times.length > 0 ? apiEvent.times : [startsAtLocal.time];
  const display = formatScheduleDateDisplay(dateIso);
  const lastSlotAt = new Date(buildIsoDateTimeInZone(dateIso, times.at(-1)));
  const departments = Array.isArray(apiEvent.departments) ? apiEvent.departments : [];

  return {
    id: apiEvent.id,
    name: apiEvent.name || "",
    description: apiEvent.description || "",
    location: apiEvent.location || "",
    startsAt: apiEvent.startsAt,
    dateIso,
    monthKey: dateIso.slice(0, 7),
    time: times[0],
    times,
    timesLabel: formatTimesLabel(times),
    day: display.day,
    monthShort: display.monthShort,
    weekdayShort: display.weekdayShort,
    weekdayFull: display.weekdayFull,
    fullDateLabel: display.fullDateLabel,
    departments,
    departmentIds: departments.map((department) => department.id),
    published: Boolean(apiEvent.published),
    isPast: lastSlotAt <= now,
    createdBy: apiEvent.createdBy ?? null,
  };
}
