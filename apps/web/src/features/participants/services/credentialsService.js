import { apiRequest } from "@/lib/apiClient";
import { normalizeUsername } from "@/lib/roles";
import {
  getStoredSession,
  sanitizeCredential,
  setStoredSession,
  updateStoredCredential,
} from "@/lib/sessionStorage";

export function listCredentials() {
  return apiRequest("/credentials");
}

export function getCredentialById(id) {
  return apiRequest(`/credentials/${encodeURIComponent(id)}`);
}

export function createCredential({ name, role, departmentIds = [] }) {
  return apiRequest("/credentials", {
    method: "POST",
    body: {
      name: String(name ?? "").trim(),
      role,
      departmentIds,
    },
  });
}

export async function regenerateCredentialNumber(id) {
  const result = await apiRequest(
    `/credentials/${encodeURIComponent(id)}/credential-number`,
    { method: "POST" }
  );

  if (
    result.ok &&
    result.data?.accessToken &&
    result.data?.refreshToken
  ) {
    const current = getStoredSession();
    const {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt,
      credentialNumber: _omit,
      ...credentialFields
    } = result.data;

    setStoredSession({
      accessToken,
      refreshToken,
      refreshTokenExpiresAt:
        refreshTokenExpiresAt ?? current?.refreshTokenExpiresAt ?? null,
      credential: sanitizeCredential({
        ...(current?.credential ?? {}),
        ...credentialFields,
      }),
    });
  }

  return result;
}

export function changeCredentialStatus(id, status) {
  return apiRequest(`/credentials/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: { status },
  });
}

export function changeCredentialRole(id, { role, departmentIds }) {
  return apiRequest(`/credentials/${encodeURIComponent(id)}/role`, {
    method: "PATCH",
    body: {
      role,
      ...(Array.isArray(departmentIds) ? { departmentIds } : {}),
    },
  });
}

export function setCredentialDepartments(id, departmentIds) {
  return apiRequest(`/credentials/${encodeURIComponent(id)}/departments`, {
    method: "PUT",
    body: { departmentIds },
  });
}

export function transferCredentialDepartment(
  id,
  { fromDepartmentId, toDepartmentId }
) {
  return apiRequest(`/credentials/${encodeURIComponent(id)}/transfer`, {
    method: "POST",
    body: { fromDepartmentId, toDepartmentId },
  });
}

export function deleteCredential(id) {
  return apiRequest(`/credentials/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function updateMyCredential({ name, username }) {
  const body = {};
  if (typeof name === "string" && name.trim()) {
    body.name = name.trim();
  }
  if (typeof username === "string" && normalizeUsername(username)) {
    body.username = normalizeUsername(username);
  }

  const result = await apiRequest("/credentials/me", {
    method: "PATCH",
    body,
  });

  if (result.ok && result.data) {
    updateStoredCredential(result.data);
  }

  return result;
}

export function listDepartments() {
  return apiRequest("/departments");
}
