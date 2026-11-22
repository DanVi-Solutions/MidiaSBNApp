import { hashCredentialNumber } from "../../shared/auth/credentialNumberHash.js";
import { buildSession, ensureNotInactive, toStoredRefreshToken } from "../../shared/auth/session.js";
import { generateRefreshToken, hashToken } from "../../shared/auth/tokens.js";
import { AppError } from "../../shared/errors/AppError.js";
import { authRepository } from "./auth.repository.js";

export function createAuthService({ repository = authRepository } = {}) {
  return {
    async login({ credentialNumber }, { userAgent }) {
      const credential = await repository.findCredentialByNumber(
        credentialNumber,
        hashCredentialNumber(credentialNumber),
      );
      if (!credential) throw AppError.unauthorized("Código de credencial inválido");
      ensureNotInactive(credential);

      const refresh = generateRefreshToken();
      const sessionId = await repository.openSession(credential.id, {
        ...toStoredRefreshToken(refresh),
        userAgent,
      });
      return buildSession(credential, refresh, sessionId);
    },

    async refresh({ refreshToken }) {
      const stored = await repository.findRefreshToken(hashToken(refreshToken));
      if (!stored) throw AppError.unauthorized("Sessão inválida");

      if (stored.expiresAt < new Date()) {
        await repository.deleteRefreshToken(stored.tokenHash);
        throw AppError.unauthorized("Sessão expirada");
      }

      ensureNotInactive(stored.credential);

      const refresh = generateRefreshToken();
      const rotated = await repository.rotateRefreshToken(stored.id, stored.tokenHash, toStoredRefreshToken(refresh));
      if (!rotated) throw AppError.unauthorized("Sessão inválida");

      return buildSession(stored.credential, refresh, stored.id);
    },

    async logout({ refreshToken }) {
      await repository.deleteRefreshToken(hashToken(refreshToken));
    },
  };
}

export const authService = createAuthService();
