import { API_HOST } from "@/lib/env";

export async function authenticateWithCredential(rawCredential) {
  const credential = String(rawCredential ?? "").trim();

  if (!credential) {
    return {
      ok: false,
      error: "Informe seu código de credencial.",
    };
  }

  if (!API_HOST) {
    return {
      ok: false,
      error:
        "Serviço de autenticação indisponível no momento. Tente novamente em instantes.",
    };
  }

  try {
    const response = await fetch(`${API_HOST}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ credential }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (response.ok) {
      return { ok: true, data: payload };
    }

    if (payload && typeof payload.message === "string" && payload.message.trim()) {
      return { ok: false, error: payload.message.trim() };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        ok: false,
        error:
          "Credencial inválida ou não autorizada. Verifique o código com o responsável.",
      };
    }

    return {
      ok: false,
      error: "Não foi possível validar sua credencial no momento. Tente novamente.",
    };
  } catch {
    return {
      ok: false,
      error:
        "Não foi possível conectar ao servidor de autenticação. Tente novamente em instantes.",
    };
  }
}
