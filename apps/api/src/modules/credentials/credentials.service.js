import { isAdmin } from "../../shared/auth/roles.js";
import { generateRefreshToken, signAccessToken } from "../../shared/auth/tokens.js";
import { AppError } from "../../shared/errors/AppError.js";
import { isPrismaError, isUniqueViolationOn } from "../../shared/errors/prismaErrors.js";
import { generateCredentialNumber, retryOnCredentialNumberCollision } from "./credential-number.js";
import * as policy from "./credentials.policy.js";
import { credentialsRepository } from "./credentials.repository.js";

function toPublicCredential(credential) {
  if (!credential) return credential;
  const { departmentIds, ...publicCredential } = credential;
  return publicCredential;
}

const sameSet = (a, b) => a.length === b.length && a.every((id) => b.includes(id));

export function createCredentialsService({
  repository = credentialsRepository,
  generateNumber = generateCredentialNumber,
} = {}) {
  async function findTarget(id) {
    const target = await repository.findById(id);
    if (!target) throw AppError.notFound("Credencial não encontrada");
    return target;
  }

  async function ensureDepartmentsExist(ids) {
    if (ids.length === 0) return;
    if ((await repository.countDepartments(ids)) !== ids.length) {
      throw AppError.unprocessable("Um ou mais departamentos não existem");
    }
  }

  async function ensureUsernameAvailable(username, exceptId) {
    if (await repository.isUsernameTaken(username, exceptId)) {
      throw AppError.conflict("Username já está em uso");
    }
  }

  async function translateUsernameConflict(operation) {
    try {
      return await operation();
    } catch (error) {
      if (isUniqueViolationOn(error, "username")) throw AppError.conflict("Username já está em uso");
      throw error;
    }
  }

  return {
    async getMe(auth) {
      return toPublicCredential(await repository.findById(auth.id, { withCredentialNumber: true }));
    },

    async getById(auth, id) {
      const target = await findTarget(id);
      policy.assertCanView(auth, target);
      return toPublicCredential(target);
    },

    async list(auth) {
      policy.assertCanList(auth);
      const credentials = await repository.list({
        departmentIds: isAdmin(auth) ? null : auth.departmentIds,
      });
      return credentials.map(toPublicCredential);
    },

    async create(auth, { name, role, departmentIds }) {
      policy.assertCanCreate(auth, { role, departmentIds });
      await ensureDepartmentsExist(departmentIds);

      const created = await retryOnCredentialNumberCollision(
        (credentialNumber) => repository.create({ name, role, credentialNumber, departmentIds }),
        generateNumber,
      );
      return toPublicCredential(created);
    },

    async checkUsername(auth, username) {
      return { username, available: !(await repository.isUsernameTaken(username, auth.id)) };
    },

    async firstAccess(auth, { name, username }) {
      await ensureUsernameAvailable(username, auth.id);
      const updated = await translateUsernameConflict(() =>
        repository.update(auth.id, { username, status: "ACTIVE", ...(name && { name }) }),
      );
      return toPublicCredential(updated);
    },

    async updateMe(auth, { name, username }) {
      if (username) await ensureUsernameAvailable(username, auth.id);
      const updated = await translateUsernameConflict(() =>
        repository.update(auth.id, { ...(name && { name }), ...(username && { username }) }),
      );
      return toPublicCredential(updated);
    },

    async delete(auth, id) {
      const target = await findTarget(id);
      policy.assertCanDelete(auth, target);

      try {
        await repository.delete(id);
      } catch (error) {
        if (isPrismaError(error, "P2003")) {
          throw AppError.conflict(
            "A credencial participa de escalas e não pode ser excluída. Desative-a (status INACTIVE).",
          );
        }
        throw error;
      }
    },

    async changeStatus(auth, id, { status }) {
      const target = await findTarget(id);
      policy.assertCanChangeStatus(auth, target, status);
      return toPublicCredential(await repository.setStatus(id, status));
    },

    async regenerateCredentialNumber(auth, id) {
      const target = await findTarget(id);
      policy.assertCanRegenerateNumber(auth, target);

      const isSelf = auth.id === target.id;
      const refresh = isSelf ? generateRefreshToken() : null;

      const credentialNumber = await retryOnCredentialNumberCollision(async (number) => {
        await repository.replaceCredentialNumber(
          id,
          number,
          refresh && { tokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt },
        );
        return number;
      }, generateNumber);

      if (!isSelf) return { credentialNumber };

      return {
        credentialNumber,
        accessToken: await signAccessToken(id),
        refreshToken: refresh.token,
        refreshTokenExpiresAt: refresh.expiresAt,
      };
    },

    async changeRole(auth, id, { role, departmentIds }) {
      const target = await findTarget(id);
      const finalDepartmentIds = departmentIds ?? target.departmentIds;

      policy.assertCanChangeRole(auth, target, role, finalDepartmentIds);
      await ensureDepartmentsExist(finalDepartmentIds);

      if (sameSet(finalDepartmentIds, target.departmentIds)) {
        return toPublicCredential(await repository.update(id, { role }));
      }
      return toPublicCredential(await repository.replaceDepartments(id, finalDepartmentIds, role));
    },

    async setDepartments(auth, id, departmentIds) {
      const target = await findTarget(id);
      policy.assertCanSetDepartments(auth, target, departmentIds);
      await ensureDepartmentsExist(departmentIds);
      return toPublicCredential(await repository.replaceDepartments(id, departmentIds));
    },

    async transfer(auth, id, { fromDepartmentId, toDepartmentId }) {
      const target = await findTarget(id);
      await ensureDepartmentsExist([toDepartmentId]);

      const { immediate } = policy.assertCanTransfer(auth, target, { fromDepartmentId, toDepartmentId });

      if (immediate) {
        await repository.moveDepartment(id, fromDepartmentId, toDepartmentId);
        return { status: "COMPLETED", credential: toPublicCredential(await repository.findById(id)) };
      }

      if (await repository.hasPendingTransfer(id)) {
        throw AppError.conflict("Esta credencial já possui uma transferência aguardando aprovação");
      }

      const transfer = await repository.createPendingTransfer({
        credentialId: id,
        fromDepartmentId,
        toDepartmentId,
        requestedById: auth.id,
      });
      return { status: "PENDING", transfer };
    },

    async listTransfers(auth) {
      policy.assertCanListTransfers(auth);
      return repository.listPendingTransfers({
        toDepartmentIds: isAdmin(auth) ? null : auth.departmentIds,
      });
    },

    async reviewTransfer(auth, transferId, { approve }) {
      const transfer = await repository.findPendingTransfer(transferId);
      if (!transfer) throw AppError.notFound("Transferência não encontrada");

      policy.assertCanReviewTransfer(auth, transfer.to.id);

      if (!approve) {
        await repository.rejectTransfer(transferId);
        return { status: "REJECTED" };
      }

      await repository.approveTransfer(transfer);
      return { status: "APPROVED", credential: toPublicCredential(await repository.findById(transfer.credentialId)) };
    },
  };
}

export const credentialsService = createCredentialsService();
