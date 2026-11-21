import { hashSecret, verifySecret } from "../../shared/auth/secretHash.js";
import { buildSession, ensureNotInactive, toStoredRefreshToken } from "../../shared/auth/session.js";
import { generateRefreshToken } from "../../shared/auth/tokens.js";
import { AppError } from "../../shared/errors/AppError.js";
import { isPrismaError } from "../../shared/errors/prismaErrors.js";
import { retryOnCredentialNumberCollision } from "../credentials/credential-number.js";
import { credentialsRepository } from "../credentials/credentials.repository.js";
import { RECOVERY_CODE_COUNT, generateRecoveryCode, normalizeRecoveryCode } from "./recovery-code.js";
import { assertCanManageRecoveryCodesOf } from "./recovery-codes.policy.js";
import { recoveryCodesRepository } from "./recovery-codes.repository.js";

const INVALID_RECOVERY = "Username ou código de recuperação inválido";

export function createRecoveryCodesService({
  repository = recoveryCodesRepository,
  credentials = credentialsRepository,
} = {}) {
  async function findManageableCredential(auth, credentialId) {
    const target = await credentials.findById(credentialId);
    if (!target) throw AppError.notFound("Credencial não encontrada");
    assertCanManageRecoveryCodesOf(auth, target);
    return target;
  }

  async function findMatchingCode(credentialId, recoveryCode) {
    const normalized = normalizeRecoveryCode(recoveryCode);
    for (const code of await repository.findByCredential(credentialId)) {
      if (await verifySecret(normalized, code.codeHash)) return code;
    }
    return null;
  }

  return {
    async remaining(auth) {
      return { remaining: await repository.countByCredential(auth.id) };
    },

    async remainingOf(auth, credentialId) {
      await findManageableCredential(auth, credentialId);
      return { remaining: await repository.countByCredential(credentialId) };
    },

    async generate(auth) {
      const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
      const hashes = await Promise.all(recoveryCodes.map((code) => hashSecret(normalizeRecoveryCode(code))));
      await repository.replaceForCredential(auth.id, hashes);
      return { recoveryCodes };
    },

    async revoke(auth) {
      await repository.deleteByCredential(auth.id);
    },

    async revokeOf(auth, credentialId) {
      await findManageableCredential(auth, credentialId);
      await repository.deleteByCredential(credentialId);
    },

    async recover({ username, recoveryCode }) {
      const credential = await repository.findCredentialByUsername(username);
      if (!credential) throw AppError.unauthorized(INVALID_RECOVERY);
      ensureNotInactive(credential);

      const matchingCode = await findMatchingCode(credential.id, recoveryCode);
      if (!matchingCode) throw AppError.unauthorized(INVALID_RECOVERY);

      const refresh = generateRefreshToken();
      try {
        const credentialNumber = await retryOnCredentialNumberCollision(async (number) => {
          await repository.redeem({
            credentialId: credential.id,
            recoveryCodeId: matchingCode.id,
            credentialNumber: number,
            refreshToken: toStoredRefreshToken(refresh),
          });
          return number;
        });
        return { credentialNumber, ...(await buildSession(credential, refresh)) };
      } catch (error) {
        if (isPrismaError(error, "P2025")) throw AppError.unauthorized(INVALID_RECOVERY);
        throw error;
      }
    },
  };
}

export const recoveryCodesService = createRecoveryCodesService();
