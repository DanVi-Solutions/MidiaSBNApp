import { apiRequest } from "@/lib/apiClient";

export function listDepartments() {
  return apiRequest("/departments");
}

export function createDepartment({ name, description, hasDemands = false }) {
  const trimmedName = String(name ?? "").trim();
  const trimmedDescription = String(description ?? "").trim();

  return apiRequest("/departments", {
    method: "POST",
    body: {
      name: trimmedName,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
      hasDemands: Boolean(hasDemands),
    },
  });
}

export function updateDepartment(id, { name, description, hasDemands }) {
  const body = {};
  if (name !== undefined) {
    body.name = String(name).trim();
  }
  if (description !== undefined) {
    body.description =
      description === null ? null : String(description).trim() || null;
  }
  if (hasDemands !== undefined) {
    body.hasDemands = Boolean(hasDemands);
  }

  return apiRequest(`/departments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
  });
}

export function deleteDepartment(id) {
  return apiRequest(`/departments/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
