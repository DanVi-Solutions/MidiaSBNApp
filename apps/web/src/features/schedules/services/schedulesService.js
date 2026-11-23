import { apiRequest } from "@/lib/apiClient";
import { computeInitials } from "@/lib/roles";
import {
  extractDateAndTimeInZone,
  formatScheduleDateDisplay,
} from "@/features/schedules/utils/scheduleDates";

export function formatAssignmentForUi(rawAssignment) {
  if (!rawAssignment?.credential) return null;

  const { credential } = rawAssignment;
  const username = credential.username || null;
  const changeStatus = rawAssignment.changeStatus || "NONE";

  return {
    id: rawAssignment.id,
    memberId: credential.id,
    initials: computeInitials(credential.name),
    name: credential.name || "",
    username,
    handle: username ? `@${username}` : "",
    roleCode: credential.role || "",
    changeStatus,
    credentialChange: rawAssignment.credentialChange ?? null,
    confirmedAt: rawAssignment.confirmedAt ?? null,
    checkedInAt: rawAssignment.checkedInAt ?? null,
  };
}

export function formatScheduleForUi(apiSchedule) {
  if (!apiSchedule) return null;

  const { dateIso, time } = extractDateAndTimeInZone(apiSchedule.scheduleAt);
  const dateDisplay = formatScheduleDateDisplay(dateIso);
  const department = apiSchedule.department || {
    id: apiSchedule.departmentId || "",
    name: "Ministério",
  };
  const assignments = Array.isArray(apiSchedule.assignments)
    ? apiSchedule.assignments.map(formatAssignmentForUi).filter(Boolean)
    : [];
  const assignedCount =
    typeof apiSchedule.assignedCount === "number"
      ? apiSchedule.assignedCount
      : assignments.length;
  const published = Boolean(apiSchedule.published);

  return {
    id: apiSchedule.id,
    scheduleAt: apiSchedule.scheduleAt,
    dateIso,
    day: dateDisplay.day,
    monthShort: dateDisplay.monthShort,
    weekdayShort: dateDisplay.weekdayShort,
    fullDateLabel: dateDisplay.fullDateLabel,
    time,
    ministryId: department.id,
    ministryName: department.name,
    name: apiSchedule.name || "",
    title: apiSchedule.name || "",
    description: apiSchedule.description || "",
    details: apiSchedule.description || "",
    published,
    statusLabel: published ? "Publicado" : "Rascunho",
    statusTone: published ? "published" : "draft",
    selfSignup: Boolean(apiSchedule.selfSignup),
    volunteersNeeded: apiSchedule.volunteersNeeded ?? null,
    assignedCount,
    recurringEventId: apiSchedule.recurringEventId ?? null,
    assignments,
    signedUp: Boolean(apiSchedule.signedUp),
    freeSlots:
      typeof apiSchedule.freeSlots === "number"
        ? apiSchedule.freeSlots
        : apiSchedule.selfSignup && apiSchedule.volunteersNeeded
          ? Math.max(0, apiSchedule.volunteersNeeded - assignedCount)
          : 0,
  };
}

export function getScheduleWindow() {
  return apiRequest("/schedules/window");
}

export function listSchedules({ departmentId, from, to } = {}) {
  const params = new URLSearchParams();
  if (departmentId) params.set("departmentId", departmentId);
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  const query = params.toString();
  return apiRequest(`/schedules${query ? `?${query}` : ""}`);
}

export function getScheduleById(id) {
  return apiRequest(`/schedules/${encodeURIComponent(id)}`);
}

export function getAvailableCredentials(id) {
  return apiRequest(`/schedules/${encodeURIComponent(id)}/available-credentials`);
}

export function listMyAssignments({ from } = {}) {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  const query = params.toString();
  return apiRequest(`/schedules/me${query ? `?${query}` : ""}`);
}

export function listOpenSchedules() {
  return apiRequest("/schedules/open");
}

export function createSchedule({
  departmentId,
  name,
  scheduleAt,
  description,
  selfSignup = false,
  volunteersNeeded,
}) {
  const trimmedName = String(name ?? "").trim();
  const trimmedDescription = String(description ?? "").trim();

  const body = {
    departmentId,
    name: trimmedName,
    scheduleAt,
    ...(trimmedDescription ? { description: trimmedDescription } : {}),
    selfSignup: Boolean(selfSignup),
  };

  if (selfSignup && volunteersNeeded !== undefined && volunteersNeeded !== null) {
    body.volunteersNeeded = Number(volunteersNeeded);
  }

  return apiRequest("/schedules", {
    method: "POST",
    body,
  });
}

export function updateSchedule(id, patch) {
  return apiRequest(`/schedules/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: patch,
  });
}

export function deleteSchedule(id) {
  return apiRequest(`/schedules/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function assignCredentialToSchedule(scheduleId, credentialId) {
  return apiRequest(
    `/schedules/${encodeURIComponent(scheduleId)}/credentials`,
    {
      method: "POST",
      body: { credentialId },
    }
  );
}

export function unassignCredentialFromSchedule(scheduleId, credentialId) {
  return apiRequest(
    `/schedules/${encodeURIComponent(scheduleId)}/credentials/${encodeURIComponent(credentialId)}`,
    {
      method: "DELETE",
    }
  );
}

export function signUpForSchedule(scheduleId) {
  return apiRequest(`/schedules/${encodeURIComponent(scheduleId)}/sign-up`, {
    method: "POST",
  });
}

export function withdrawFromSchedule(scheduleId) {
  return apiRequest(`/schedules/${encodeURIComponent(scheduleId)}/sign-up`, {
    method: "DELETE",
  });
}

export function listMyChangeRequests() {
  return apiRequest("/change-requests");
}

export function requestScheduleChange({ assignmentId, substituteId }) {
  return apiRequest("/change-requests", {
    method: "POST",
    body: { assignmentId, substituteId },
  });
}

export function acceptChangeRequest(assignmentId) {
  return apiRequest(
    `/change-requests/${encodeURIComponent(assignmentId)}/accept`,
    {
      method: "POST",
    }
  );
}

export function rejectChangeRequest(assignmentId) {
  return apiRequest(
    `/change-requests/${encodeURIComponent(assignmentId)}/reject`,
    {
      method: "POST",
    }
  );
}

export function cancelChangeRequest(assignmentId) {
  return apiRequest(`/change-requests/${encodeURIComponent(assignmentId)}`, {
    method: "DELETE",
  });
}

export function confirmPresence(assignmentId) {
  return apiRequest(
    `/schedules/me/${encodeURIComponent(assignmentId)}/confirmation`,
    { method: "POST" }
  );
}

export function checkInToSchedule(assignmentId) {
  return apiRequest(
    `/schedules/me/${encodeURIComponent(assignmentId)}/check-in`,
    { method: "POST" }
  );
}

export function autoAssignSchedules({ schedules, dryRun = false, seed }) {
  return apiRequest("/schedules/auto-assign", {
    method: "POST",
    body: {
      schedules,
      dryRun,
      ...(typeof seed === "number" ? { seed } : {}),
    },
  });
}
