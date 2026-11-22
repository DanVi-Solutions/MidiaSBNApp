import { AppError } from "../errors/AppError.js";
import { signAccessToken } from "./tokens.js";

export const sessionCredentialSelect = { id: true, name: true, username: true, status: true, role: true };

export function ensureNotInactive(credential) {
  if (credential.status === "INACTIVE") throw AppError.forbidden("Credencial inativa");
}

export const toStoredRefreshToken = ({ tokenHash, expiresAt }) => ({ tokenHash, expiresAt });

export async function buildSession(credential, refresh, sessionId) {
  return {
    accessToken: await signAccessToken(credential.id, sessionId),
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
    credential,
  };
}
