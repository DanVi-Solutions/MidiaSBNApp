import { apiRequest } from "@/lib/apiClient";
import { normalizeUsername } from "@/lib/roles";
import {
  clearStoredSession,
  getStoredSession,
  sanitizeCredential,
  setStoredSession,
  updateStoredCredential,
} from "@/lib/sessionStorage";

export async function loginWithCredential(rawCredentialNumber) {
  const credentialNumber = String(rawCredentialNumber ?? "")
    .trim()
    .toUpperCase();

  if (!credentialNumber) {
    return {
      ok: false,
      error: "Informe seu código de credencial.",
    };
  }

  const result = await apiRequest("/auth/login", {
    method: "POST",
    auth: false,
    retryOnAuth: false,
    body: { credentialNumber },
  });

  if (!result.ok) {
    return result;
  }

  const session = setStoredSession(result.data);
  if (!session) {
    return {
      ok: false,
      error: "Resposta de autenticação inválida. Tente novamente.",
    };
  }

  return { ok: true, data: session };
}

export async function logoutSession() {
  const session = getStoredSession();
  const refreshToken = session?.refreshToken;

  clearStoredSession();

  if (refreshToken) {
    await apiRequest("/auth/logout", {
      method: "POST",
      auth: false,
      retryOnAuth: false,
      body: { refreshToken },
    });
  }

  return { ok: true };
}

export async function fetchMyCredential() {
  const result = await apiRequest("/credentials/me");
  if (result.ok && result.data) {
    updateStoredCredential(result.data);
    return { ok: true, data: sanitizeCredential(result.data) };
  }
  return result;
}

export async function checkUsernameAvailability(rawUsername) {
  const username = normalizeUsername(rawUsername);
  if (!username) {
    return { ok: false, error: "Informe um apelido." };
  }

  const params = new URLSearchParams({ username });
  return apiRequest(`/credentials/username-availability?${params.toString()}`);
}

export function prepareActivationCode() {
  return apiRequest("/credentials/me/prepare-code", {
    method: "POST",
  });
}

export async function submitFirstAccess({
  name,
  username,
  activationToken,
}) {
  const normalizedUsername = normalizeUsername(username);
  const trimmedName = String(name ?? "").trim();

  const body = {
    username: normalizedUsername,
    ...(trimmedName ? { name: trimmedName } : {}),
    ...(activationToken ? { activationToken } : {}),
  };

  const result = await apiRequest("/credentials/me/first-access", {
    method: "POST",
    body,
  });

  if (result.ok && result.data) {
    updateStoredCredential(result.data);
  }

  return result;
}

export async function completeAccountRecovery({ activationToken } = {}) {
  const result = await apiRequest("/credentials/me/complete-recovery", {
    method: "POST",
    ...(activationToken ? { body: { activationToken } } : {}),
  });

  if (result.ok && result.data) {
    updateStoredCredential(result.data);
  }

  return result;
}
