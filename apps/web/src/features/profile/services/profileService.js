import { API_HOST } from "@/lib/env";

export async function deleteAccountRequest() {
  if (!API_HOST) {
    return { ok: true, simulated: true };
  }

  try {
    const response = await fetch(`${API_HOST}/auth/account`, {
      method: "DELETE",
      credentials: "include",
    });

    if (response.ok) {
      return { ok: true };
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (payload && typeof payload.message === "string" && payload.message.trim()) {
      return { ok: false, error: payload.message.trim() };
    }

    return {
      ok: false,
      error: "Não foi possível excluir a conta no momento. Tente novamente.",
    };
  } catch {
    return {
      ok: false,
      error:
        "Não foi possível conectar ao servidor para excluir a conta. Tente novamente.",
    };
  }
}
