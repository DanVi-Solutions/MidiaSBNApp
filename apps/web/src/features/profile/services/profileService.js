import { checkUsernameAvailability } from "@/features/auth/services/authService";
import {
  deleteCredential,
  regenerateCredentialNumber,
  updateMyCredential,
} from "@/features/participants/services/credentialsService";
import { clearStoredSession, getStoredSession } from "@/lib/sessionStorage";

export function updateProfileRequest({ name, username }) {
  return updateMyCredential({ name, username });
}

export function checkUsernameAvailabilityRequest(username) {
  return checkUsernameAvailability(username);
}

export function regenerateOwnCredentialRequest(credentialId) {
  const id = credentialId || getStoredSession()?.credential?.id;
  if (!id) {
    return Promise.resolve({
      ok: false,
      error: "Sessão inválida. Faça login novamente.",
    });
  }
  return regenerateCredentialNumber(id);
}

export async function deleteAccountRequest(credentialId) {
  const id = credentialId || getStoredSession()?.credential?.id;
  if (!id) {
    return {
      ok: false,
      error: "Sessão inválida. Faça login novamente.",
    };
  }

  const result = await deleteCredential(id);
  if (result.ok) {
    clearStoredSession();
  }
  return result;
}
