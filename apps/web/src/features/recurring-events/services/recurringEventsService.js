import { apiRequest } from "@/lib/apiClient";

export const MAX_RECURRING_EVENT_TIMES = 10;

export const WEEKDAY_OPTIONS = [
  { code: "SUNDAY", label: "Domingo", repeatPrefix: "Repete todo" },
  { code: "MONDAY", label: "Segunda-feira", repeatPrefix: "Repete toda" },
  { code: "TUESDAY", label: "Terça-feira", repeatPrefix: "Repete toda" },
  { code: "WEDNESDAY", label: "Quarta-feira", repeatPrefix: "Repete toda" },
  { code: "THURSDAY", label: "Quinta-feira", repeatPrefix: "Repete toda" },
  { code: "FRIDAY", label: "Sexta-feira", repeatPrefix: "Repete toda" },
  { code: "SATURDAY", label: "Sábado", repeatPrefix: "Repete todo" },
];

export function getWeekdayMeta(codeOrLabel) {
  return (
    WEEKDAY_OPTIONS.find(
      (item) => item.code === codeOrLabel || item.label === codeOrLabel
    ) || WEEKDAY_OPTIONS[0]
  );
}

export function normalizeWallTimeValue(rawTime) {
  const trimmed = String(rawTime ?? "").trim();
  if (!trimmed) return "";

  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (match) {
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }

  return trimmed;
}

export function normalizeTimesList(times = []) {
  const clean = [];
  const seen = new Set();

  for (const raw of times) {
    const normalized = normalizeWallTimeValue(raw);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      clean.push(normalized);
    }
  }

  return clean.sort();
}

export function formatRecurringEventForUi(apiEvent) {
  if (!apiEvent) return null;

  const weekdayMeta = getWeekdayMeta(apiEvent.weekday);
  const normalizedTimes = normalizeTimesList(
    Array.isArray(apiEvent.times)
      ? apiEvent.times
      : apiEvent.time
        ? [apiEvent.time]
        : []
  );
  const departments = Array.isArray(apiEvent.departments)
    ? apiEvent.departments.filter((dept) => dept?.id && dept?.name)
    : apiEvent.department?.id && apiEvent.department?.name
      ? [apiEvent.department]
      : [];
  const departmentIds = departments.map((dept) => dept.id);
  const isGlobal =
    typeof apiEvent.isGlobal === "boolean"
      ? apiEvent.isGlobal
      : departmentIds.length === 0;
  const singleDepartment =
    !isGlobal && departments.length === 1 ? departments[0] : null;
  const ministryName = isGlobal
    ? "Todos os ministérios"
    : departments.length > 0
      ? departments.map((dept) => dept.name).join(", ")
      : "Ministérios do líder";

  return {
    id: apiEvent.id,
    name: apiEvent.name || "",
    title: apiEvent.name || "",
    description: apiEvent.description || "",
    weekdayCode: weekdayMeta.code,
    weekday: weekdayMeta.label,
    repeatPrefix: weekdayMeta.repeatPrefix,
    times: normalizedTimes,
    time: normalizedTimes[0] || "",
    isGlobal,
    isGeneral: isGlobal,
    createdById: apiEvent.createdById ?? null,
    departments,
    departmentIds,
    departmentId: singleDepartment?.id ?? null,
    department: singleDepartment ?? null,
    ministryName,
  };
}

export function listRecurringEvents() {
  return apiRequest("/recurring-events");
}

export function getRecurringEventById(id) {
  return apiRequest(`/recurring-events/${encodeURIComponent(id)}`);
}

export function createRecurringEvent({
  name,
  description,
  weekday,
  times,
}) {
  const trimmedName = String(name ?? "").trim();
  const trimmedDescription = String(description ?? "").trim();
  const weekdayMeta = getWeekdayMeta(weekday);
  const normalizedTimes = normalizeTimesList(times);

  return apiRequest("/recurring-events", {
    method: "POST",
    body: {
      name: trimmedName,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
      weekday: weekdayMeta.code,
      times: normalizedTimes,
    },
  });
}

export function promoteRecurringEvent(id) {
  return apiRequest(`/recurring-events/${encodeURIComponent(id)}/promote`, {
    method: "POST",
  });
}

export function updateRecurringEvent(id, { name, description, weekday, times }) {
  const body = {};

  if (name !== undefined) {
    body.name = String(name).trim();
  }
  if (description !== undefined) {
    body.description =
      description === null ? null : String(description).trim() || null;
  }
  if (weekday !== undefined) {
    body.weekday = getWeekdayMeta(weekday).code;
  }
  if (times !== undefined) {
    body.times = normalizeTimesList(times);
  }

  return apiRequest(`/recurring-events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
}

export function deleteRecurringEvent(id) {
  return apiRequest(`/recurring-events/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function applyRecurringEvent(id, body = {}) {
  return apiRequest(`/recurring-events/${encodeURIComponent(id)}/apply`, {
    method: "POST",
    body,
  });
}
