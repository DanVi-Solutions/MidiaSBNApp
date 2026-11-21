import { buildSession, ensureNotInactive, toStoredRefreshToken } from "../../shared/auth/session.js";
import { generateRefreshToken, hashToken } from "../../shared/auth/tokens.js";
import { AppError } from "../../shared/errors/AppError.js";
import { isPrismaError } from "../../shared/errors/prismaErrors.js";
import { authRepository } from "./auth.repository.js";

export function createAuthService({ repository = authRepository } = {}) {
  return {
    async login({ credentialNumber }) {
      const credential = await repository.findCredentialByNumber(credentialNumber);
      if (!credential) throw AppError.unauthorized("Código de credencial inválido");
      ensureNotInactive(credential);

      const refresh = generateRefreshToken();
      await repository.createRefreshToken(credential.id, toStoredRefreshToken(refresh));
      return buildSession(credential, refresh);
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
      try {
        await repository.rotateRefreshToken(stored.id, stored.credentialId, toStoredRefreshToken(refresh));
      } catch (error) {
        if (isPrismaError(error, "P2025")) throw AppError.unauthorized("Sessão inválida");
        throw error;
      }
      return buildSession(stored.credential, refresh);
    },

    async logout({ refreshToken }) {
      await repository.deleteRefreshToken(hashToken(refreshToken));
    },

    async logoutAll(auth) {
      await repository.deleteAllRefreshTokens(auth.id);
    },
  };
}

export const authService = createAuthService();
