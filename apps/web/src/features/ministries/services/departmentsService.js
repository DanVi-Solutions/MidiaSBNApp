import { apiRequest } from "@/lib/apiClient";

export function listDepartments() {
  return apiRequest("/departments");
}

export function createDepartment({ name, description }) {
  const trimmedName = String(name ?? "").trim();
  const trimmedDescription = String(description ?? "").trim();

  return apiRequest("/departments", {
    method: "POST",
    body: {
      name: trimmedName,
      ...(trimmedDescription ? { description: trimmedDescription } : {}),
    },
  });
}

export function updateDepartment(id, { name, description }) {
  const body = {};
  if (name !== undefined) {
    body.name = String(name).trim();
  }
  if (description !== undefined) {
    body.description =
      description === null ? null : String(description).trim() || null;
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
