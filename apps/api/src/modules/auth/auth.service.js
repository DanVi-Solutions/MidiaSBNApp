import { hashSecret, verifySecret } from "../../shared/auth/secretHash.js";
import { generateRefreshToken, hashToken, signAccessToken } from "../../shared/auth/tokens.js";
import { AppError } from "../../shared/errors/AppError.js";
import { isPrismaError } from "../../shared/errors/prismaErrors.js";
import { retryOnCredentialNumberCollision } from "../credentials/credential-number.js";
import { authRepository } from "./auth.repository.js";
import { RECOVERY_CODE_COUNT, generateRecoveryCode, normalizeRecoveryCode } from "./recovery-code.js";

const INVALID_RECOVERY = "Username ou código de recuperação inválido";

function ensureNotInactive(credential) {
  if (credential.status === "INACTIVE") throw AppError.forbidden("Credencial inativa");
}

async function toSession(credential, refresh) {
  return {
    accessToken: await signAccessToken(credential.id),
    refreshToken: refresh.token,
    refreshTokenExpiresAt: refresh.expiresAt,
    credential,
  };
}

const toStoredToken = ({ tokenHash, expiresAt }) => ({ tokenHash, expiresAt });

export function createAuthService({ repository = authRepository } = {}) {
  async function findMatchingRecoveryCode(credentialId, recoveryCode) {
    const normalized = normalizeRecoveryCode(recoveryCode);
    for (const code of await repository.findRecoveryCodes(credentialId)) {
      if (await verifySecret(normalized, code.codeHash)) return code;
    }
    return null;
  }

  return {
    async login({ credentialNumber }) {
      const credential = await repository.findCredentialByNumber(credentialNumber);
      if (!credential) throw AppError.unauthorized("Código de credencial inválido");
      ensureNotInactive(credential);

      const refresh = generateRefreshToken();
      await repository.createRefreshToken(credential.id, toStoredToken(refresh));
      return toSession(credential, refresh);
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
        await repository.rotateRefreshToken(stored.id, stored.credentialId, toStoredToken(refresh));
      } catch (error) {
        if (isPrismaError(error, "P2025")) throw AppError.unauthorized("Sessão inválida");
        throw error;
      }
      return toSession(stored.credential, refresh);
    },

    async logout({ refreshToken }) {
      await repository.deleteRefreshToken(hashToken(refreshToken));
    },

    async logoutAll(auth) {
      await repository.deleteAllRefreshTokens(auth.id);
    },

    async generateRecoveryCodes(auth) {
      const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
      const hashes = await Promise.all(recoveryCodes.map((code) => hashSecret(normalizeRecoveryCode(code))));
      await repository.replaceRecoveryCodes(auth.id, hashes);
      return { recoveryCodes };
    },

    async recoveryCodesStatus(auth) {
      return { remaining: await repository.countRecoveryCodes(auth.id) };
    },

    async recover({ username, recoveryCode }) {
      const credential = await repository.findCredentialByUsername(username);
      if (!credential) throw AppError.unauthorized(INVALID_RECOVERY);
      ensureNotInactive(credential);

      const matchingCode = await findMatchingRecoveryCode(credential.id, recoveryCode);
      if (!matchingCode) throw AppError.unauthorized(INVALID_RECOVERY);

      const refresh = generateRefreshToken();
      try {
        const credentialNumber = await retryOnCredentialNumberCollision(async (number) => {
          await repository.recoverAccess({
            credentialId: credential.id,
            recoveryCodeId: matchingCode.id,
            credentialNumber: number,
            refreshToken: toStoredToken(refresh),
          });
          return number;
        });
        return { credentialNumber, ...(await toSession(credential, refresh)) };
      } catch (error) {
        if (isPrismaError(error, "P2025")) throw AppError.unauthorized(INVALID_RECOVERY);
        throw error;
      }
    },
  };
}

export const authService = createAuthService();
