import { API_HOST } from "@/lib/env";
import {
  clearStoredSession,
  getStoredSession,
  setStoredSession,
} from "@/lib/sessionStorage";

let refreshInFlight = null;
const unauthorizedListeners = new Set();

export function subscribeUnauthorized(listener) {
  if (typeof listener !== "function") {
    return () => {};
  }
  unauthorizedListeners.add(listener);
  return () => {
    unauthorizedListeners.delete(listener);
  };
}

function notifyUnauthorized(reason) {
  for (const listener of unauthorizedListeners) {
    try {
      listener(reason);
    } catch {
      // Ignore listener failure
    }
  }
}

async function parseJsonSafe(response) {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await response.text().catch(() => "");
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function extractApiErrorMessage(status, payload) {
  if (status === 422 && Array.isArray(payload?.details) && payload.details.length > 0) {
    const firstDetail = payload.details.find(
      (item) => typeof item?.message === "string" && item.message.trim()
    );
    if (firstDetail) {
      return firstDetail.message.trim();
    }
  }

  if (typeof payload?.error === "string" && payload.error.trim()) {
    return payload.error.trim();
  }

  if (typeof payload?.message === "string" && payload.message.trim()) {
    return payload.message.trim();
  }

  if (status === 401) {
    return "Sua sessão expirou ou foi encerrada. Faça login novamente.";
  }
  if (status === 403) {
    return "Você não tem permissão para realizar esta ação.";
  }
  if (status === 404) {
    return "Registro não encontrado.";
  }
  if (status === 409) {
    return "Conflito com os dados atuais. Revise e tente novamente.";
  }
  if (status === 429) {
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  }

  return "Não foi possível concluir a requisição. Tente novamente.";
}

async function performRefresh() {
  const session = getStoredSession();
  if (!session?.refreshToken || !API_HOST) {
    clearStoredSession();
    return null;
  }

  try {
    const response = await fetch(`${API_HOST}/auth/refresh`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });

    const payload = await parseJsonSafe(response);
    if (!response.ok || !payload?.accessToken || !payload?.refreshToken) {
      clearStoredSession();
      return null;
    }

    return setStoredSession(payload);
  } catch {
    return null;
  }
}

export async function refreshAuthSession() {
  if (!refreshInFlight) {
    refreshInFlight = performRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function apiRequest(
  path,
  { method = "GET", body, auth = true, retryOnAuth = true, headers: extraHeaders } = {}
) {
  if (!API_HOST) {
    return {
      ok: false,
      status: 0,
      error:
        "Servidor da API não configurado. Verifique NEXT_PUBLIC_API_HOST.",
      data: null,
      details: null,
    };
  }

  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const session = auth ? getStoredSession() : null;

  if (auth && !session?.accessToken) {
    return {
      ok: false,
      status: 401,
      error: "Sessão não encontrada. Faça login novamente.",
      data: null,
      details: null,
    };
  }

  const headers = {
    ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(auth && session?.accessToken
      ? { Authorization: `Bearer ${session.accessToken}` }
      : {}),
    ...extraHeaders,
  };

  let response;
  try {
    response = await fetch(`${API_HOST}${normalizedPath}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      error:
        "Não foi possível conectar ao servidor no momento. Tente novamente em instantes.",
      data: null,
      details: null,
    };
  }

  if (response.status === 401 && auth && retryOnAuth) {
    const refreshed = await refreshAuthSession();
    if (refreshed?.accessToken) {
      return apiRequest(normalizedPath, {
        method,
        body,
        auth,
        retryOnAuth: false,
        headers: extraHeaders,
      });
    }

    clearStoredSession();
    const payload = await parseJsonSafe(response);
    const errorMsg = extractApiErrorMessage(401, payload);
    notifyUnauthorized(errorMsg);
    return {
      ok: false,
      status: 401,
      error: errorMsg,
      data: null,
      details: payload?.details ?? null,
    };
  }

  const payload = await parseJsonSafe(response);

  if (response.ok) {
    return {
      ok: true,
      status: response.status,
      data: payload,
      error: null,
      details: null,
    };
  }

  if (response.status === 401 && auth) {
    clearStoredSession();
    notifyUnauthorized(extractApiErrorMessage(401, payload));
  }

  return {
    ok: false,
    status: response.status,
    error: extractApiErrorMessage(response.status, payload),
    data: null,
    details: payload?.details ?? null,
  };
}
