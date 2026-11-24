import { apiRequest } from "@/lib/apiClient";
import {
  extractDateAndTimeInZone,
  formatScheduleDateDisplay,
} from "@/features/schedules/utils/scheduleDates";

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
  const { dateIso, time } = extractDateAndTimeInZone(apiEvent.startsAt);
  const display = formatScheduleDateDisplay(dateIso);
  const departments = Array.isArray(apiEvent.departments) ? apiEvent.departments : [];

  return {
    id: apiEvent.id,
    name: apiEvent.name || "",
    description: apiEvent.description || "",
    location: apiEvent.location || "",
    startsAt: apiEvent.startsAt,
    dateIso,
    monthKey: dateIso.slice(0, 7),
    time,
    day: display.day,
    monthShort: display.monthShort,
    weekdayShort: display.weekdayShort,
    weekdayFull: display.weekdayFull,
    fullDateLabel: display.fullDateLabel,
    departments,
    departmentIds: departments.map((department) => department.id),
    published: Boolean(apiEvent.published),
    isPast: new Date(apiEvent.startsAt) <= now,
    createdBy: apiEvent.createdBy ?? null,
  };
}
