import { apiRequest } from "@/lib/apiClient";

export function listDemands({ departmentId, status } = {}) {
  const params = new URLSearchParams();
  if (departmentId) params.set("departmentId", departmentId);
  if (status) params.set("status", status);
  const qs = params.toString();
  return apiRequest(qs ? `/demands?${qs}` : "/demands");
}

export function getDemandCandidates(departmentId) {
  const params = new URLSearchParams({ departmentId });
  return apiRequest(`/demands/candidates?${params.toString()}`);
}

export function createDemand({
  title,
  description,
  departmentId,
  assigneeIds,
  dueAt,
}) {
  return apiRequest("/demands", {
    method: "POST",
    body: {
      title: String(title ?? "").trim(),
      description: String(description ?? "").trim() || null,
      departmentId,
      ...(Array.isArray(assigneeIds) ? { assigneeIds } : {}),
      dueAt: dueAt || null,
    },
  });
}

export function updateDemand(id, patch) {
  const body = {};
  if (patch.title !== undefined) {
    body.title = String(patch.title ?? "").trim();
  }
  if (patch.description !== undefined) {
    body.description =
      patch.description === null
        ? null
        : String(patch.description ?? "").trim() || null;
  }
  if (patch.assigneeIds !== undefined) {
    body.assigneeIds = Array.isArray(patch.assigneeIds)
      ? patch.assigneeIds
      : [];
  }
  if (patch.status !== undefined) {
    body.status = patch.status;
  }
  if (patch.dueAt !== undefined) {
    body.dueAt = patch.dueAt || null;
  }

  return apiRequest(`/demands/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
}

export function deleteDemand(id) {
  return apiRequest(`/demands/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
