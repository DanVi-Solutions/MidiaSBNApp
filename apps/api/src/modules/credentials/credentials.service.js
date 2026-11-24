import { hashCredentialNumber } from "../../shared/auth/credentialNumberHash.js";
import { ROLES, isAdmin, isAtLeast } from "../../shared/auth/roles.js";
import {
  generateRefreshToken,
  signAccessToken,
  signActivationToken,
  verifyActivationToken,
} from "../../shared/auth/tokens.js";
import { AppError } from "../../shared/errors/AppError.js";
import { isPrismaError, isUniqueViolationOn } from "../../shared/errors/prismaErrors.js";
import { messages } from "../notifications/notifications.messages.js";
import { notifier as defaultNotifier } from "../notifications/notifications.notifier.js";
import { notificationsRepository } from "../notifications/notifications.repository.js";
import { generateCredentialNumber, retryOnCredentialNumberCollision } from "./credential-number.js";
import * as policy from "./credentials.policy.js";
import { toPublicCredential, withCredentialNumber } from "./credentials.presenter.js";
import { credentialsRepository } from "./credentials.repository.js";

const sameSet = (a, b) => a.length === b.length && a.every((id) => b.includes(id));

const MEMBER_VISIBLE_STATUSES = ["ACTIVE", "RECOVERING"];
const canSeeActualStatus = (auth) => isAtLeast(auth.role, ROLES.DEPARTMENT_MANAGER);
const maskStatusForMemberView = (credential) =>
  credential?.status === "RECOVERING" ? { ...credential, status: "ACTIVE" } : credential;

const departmentNamesOf = (credential) => (credential.departments ?? []).map((department) => department.name);

export function createCredentialsService({
  repository = credentialsRepository,
  generateNumber = generateCredentialNumber,
  notifier = defaultNotifier,
  recipients = notificationsRepository,
} = {}) {
  async function findTarget(id) {
    const target = await repository.findById(id);
    if (!target) throw AppError.notFound("Credencial não encontrada");
    return target;
  }

  async function ensureDepartmentsExist(ids) {
    if (ids.length === 0) return;
    if ((await repository.countDepartments(ids)) !== ids.length) {
      throw AppError.unprocessable("Um ou mais ministérios não existem");
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

  function withNewNumber(operation, role) {
    return retryOnCredentialNumberCollision(
      async (credentialNumber) => ({ credentialNumber, result: await operation(credentialNumber) }),
      () => generateNumber(role),
    );
  }

  async function activateWithNewHashedNumber(id, data, role) {
    const { credentialNumber, result } = await withNewNumber(
      (number) => repository.activateWithHashedNumber(id, hashCredentialNumber(number), data),
      role,
    );
    return withCredentialNumber(result, credentialNumber);
  }

  async function resolveActivationCode(auth, activationToken) {
    let decoded;
    try {
      decoded = await verifyActivationToken(activationToken);
    } catch {
      throw AppError.unprocessable(
        "O código exibido expirou ou não corresponde a esta sessão. Gere um novo código para continuar.",
      );
    }

    if (
      decoded.credentialId !== auth.id ||
      decoded.sessionId !== auth.sessionId ||
      decoded.expectedStatus !== auth.status
    ) {
      throw AppError.unprocessable(
        "O código exibido expirou ou não corresponde a esta sessão. Gere um novo código para continuar.",
      );
    }

    return decoded.credentialNumber;
  }

  async function activateWithFixedNumber(id, credentialNumber, data = {}) {
    try {
      const result = await repository.activateWithHashedNumber(
        id,
        hashCredentialNumber(credentialNumber),
        data,
      );
      return withCredentialNumber(result, credentialNumber);
    } catch (error) {
      if (
        isUniqueViolationOn(error, "credential_number") ||
        isUniqueViolationOn(error, "credential_number_hash")
      ) {
        throw AppError.conflict("Não foi possível confirmar este código. Gere um novo código e tente novamente.");
      }
      throw error;
    }
  }

  async function announceMembershipChange(auth, before, after) {
    const options = { except: auth.id };
    if (before.role !== after.role) await notifier.to([after.id], messages.roleChanged(after.role), options);
    if (!sameSet(before.departmentIds ?? [], after.departmentIds ?? [])) {
      await notifier.to([after.id], messages.departmentChanged(departmentNamesOf(after)), options);
    }
  }

  async function issueNewReadableNumber(id, status, role) {
    const { credentialNumber, result } = await withNewNumber(
      (number) => repository.issueReadableNumber(id, number, status),
      role,
    );
    return withCredentialNumber(result, credentialNumber);
  }

  return {
    async getMe(auth) {
      return withCredentialNumber(await repository.findById(auth.id));
    },

    async getById(auth, id) {
      const target = await findTarget(id);
      policy.assertCanViewMember(auth, target);
      const seesActualStatus = auth.id === target.id || canSeeActualStatus(auth);
      if (!seesActualStatus && !MEMBER_VISIBLE_STATUSES.includes(target.status)) {
        throw AppError.notFound("Credencial não encontrada");
      }
      const presented = policy.canHandOutCredentialNumber(auth, target)
        ? withCredentialNumber(target)
        : toPublicCredential(target);
      return seesActualStatus ? presented : maskStatusForMemberView(presented);
    },

    async list(auth) {
      policy.assertCanListMembers(auth);
      const admin = isAdmin(auth);
      const seesActualStatus = canSeeActualStatus(auth);
      const credentials = await repository.list({
        departmentIds: admin ? null : auth.departmentIds,
        excludeRoles: admin ? [ROLES.DEVELOPER] : [ROLES.DEVELOPER, ROLES.ADMINISTRATOR],
        statuses: seesActualStatus ? null : MEMBER_VISIBLE_STATUSES,
      });
      return credentials.map((item) => {
        const presented = toPublicCredential(item);
        return seesActualStatus ? presented : maskStatusForMemberView(presented);
      });
    },

    async create(auth, { name, role, departmentIds }) {
      policy.assertCanCreate(auth, { role, departmentIds });
      await ensureDepartmentsExist(departmentIds);

      const { result } = await withNewNumber(
        (credentialNumber) => repository.create({ name, role, credentialNumber, departmentIds }),
        role,
      );
      return withCredentialNumber(result);
    },

    async checkUsername(auth, username) {
      return { username, available: !(await repository.isUsernameTaken(username, auth.id)) };
    },

    async prepareActivationCode(auth) {
      let chosen = "";
      for (let attempt = 0; attempt < 5; attempt++) {
        const candidate = generateNumber(auth.role);
        const taken = repository.isCredentialNumberTaken
          ? await repository.isCredentialNumberTaken(candidate, hashCredentialNumber(candidate))
          : false;
        if (!taken) {
          chosen = candidate;
          break;
        }
      }

      if (!chosen) {
        throw AppError.conflict("Não foi possível gerar um código disponível. Tente novamente.");
      }

      const activationToken = await signActivationToken({
        credentialId: auth.id,
        sessionId: auth.sessionId,
        credentialNumber: chosen,
        expectedStatus: auth.status,
      });

      return { credentialNumber: chosen, activationToken };
    },

    async firstAccess(auth, { name, username, activationToken }) {
      await ensureUsernameAvailable(username, auth.id);
      const data = { username, ...(name && { name }) };

      if (activationToken) {
        const fixedCode = await resolveActivationCode(auth, activationToken);
        return translateUsernameConflict(() => activateWithFixedNumber(auth.id, fixedCode, data));
      }

      return translateUsernameConflict(() => activateWithNewHashedNumber(auth.id, data, auth.role));
    },

    async completeRecovery(auth, { activationToken } = {}) {
      if (activationToken) {
        const fixedCode = await resolveActivationCode(auth, activationToken);
        return activateWithFixedNumber(auth.id, fixedCode);
      }

      return activateWithNewHashedNumber(auth.id, {}, auth.role);
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

      if (status === "INACTIVE") return toPublicCredential(await repository.deactivate(id));
      return issueNewReadableNumber(id, "RECOVERING", target.role);
    },

    async regenerateCredentialNumber(auth, id, { userAgent }) {
      const target = await findTarget(id);
      policy.assertCanRegenerateNumber(auth, target);

      if (auth.id !== target.id) {
        const statusAfterReset = target.status === "PENDING" ? "PENDING" : "RECOVERING";
        return issueNewReadableNumber(id, statusAfterReset, target.role);
      }

      const refresh = generateRefreshToken();
      const { credentialNumber, result: sessionId } = await withNewNumber(
        (number) =>
          repository.rotateHashedNumber(id, hashCredentialNumber(number), {
            tokenHash: refresh.tokenHash,
            expiresAt: refresh.expiresAt,
            userAgent,
          }),
        target.role,
      );

      return {
        ...toPublicCredential(target),
        credentialNumber,
        accessToken: await signAccessToken(id, sessionId),
        refreshToken: refresh.token,
        refreshTokenExpiresAt: refresh.expiresAt,
      };
    },

    async changeRole(auth, id, { role, departmentIds }) {
      const target = await findTarget(id);
      const finalDepartmentIds = departmentIds ?? target.departmentIds;

      policy.assertCanChangeRole(auth, target, role, finalDepartmentIds);
      await ensureDepartmentsExist(finalDepartmentIds);

      const updated = sameSet(finalDepartmentIds, target.departmentIds)
        ? await repository.update(id, { role })
        : await repository.replaceDepartments(id, finalDepartmentIds, role);
      await announceMembershipChange(auth, target, updated);
      return toPublicCredential(updated);
    },

    async setDepartments(auth, id, departmentIds) {
      const target = await findTarget(id);
      policy.assertCanSetDepartments(auth, target, departmentIds);
      await ensureDepartmentsExist(departmentIds);
      const updated = await repository.replaceDepartments(id, departmentIds);
      await announceMembershipChange(auth, target, updated);
      return toPublicCredential(updated);
    },

    async transfer(auth, id, { fromDepartmentId, toDepartmentId }) {
      const target = await findTarget(id);
      await ensureDepartmentsExist([toDepartmentId]);

      const { immediate } = policy.assertCanTransfer(auth, target, { fromDepartmentId, toDepartmentId });

      if (immediate) {
        await repository.moveDepartment(id, fromDepartmentId, toDepartmentId);
        const moved = await repository.findById(id);
        await announceMembershipChange(auth, target, moved);
        return { status: "COMPLETED", credential: toPublicCredential(moved) };
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
      await notifier.safely(async () => {
        const reviewers = await recipients.transferReviewersOf(toDepartmentId);
        await notifier.to(reviewers, messages.transferRequested(transfer), { except: auth.id });
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
        if (transfer.requestedBy) {
          await notifier.to([transfer.requestedBy.id], messages.transferRejected(transfer), { except: auth.id });
        }
        return { status: "REJECTED" };
      }

      const before = await repository.findById(transfer.credentialId);
      await repository.approveTransfer(transfer);
      const moved = await repository.findById(transfer.credentialId);
      await announceMembershipChange(auth, before, moved);
      return { status: "APPROVED", credential: toPublicCredential(moved) };
    },
  };
}

export const credentialsService = createCredentialsService();
