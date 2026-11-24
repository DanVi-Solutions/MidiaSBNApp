import { env } from "../../config/env.js";
import {
  assertCanCreateDemandsIn,
  canManageDemandsOf,
  canViewDemandsOf,
  participatesIn,
} from "../../shared/auth/departmentAccess.js";
import { ROLES, isAdmin, isAtLeast, isDeveloper } from "../../shared/auth/roles.js";
import { AppError } from "../../shared/errors/AppError.js";
import { messages } from "../notifications/notifications.messages.js";
import { notifier as defaultNotifier } from "../notifications/notifications.notifier.js";
import { notificationsRepository } from "../notifications/notifications.repository.js";
import { completedDemandCutoff } from "./demands.cleanup.js";
import { demandsRepository } from "./demands.repository.js";

function assertDepartmentUsesDemands(department) {
  if (!department) throw AppError.notFound("Ministério não encontrado");
  if (!department.hasDemands) {
    throw AppError.unprocessable("Este ministério não utiliza a página de demandas");
  }
}

function assertCanAssignToDemand(auth, departmentId, candidate) {
  if (!candidate || candidate.status === "INACTIVE") {
    throw AppError.unprocessable("Responsável inválido ou inativo");
  }
  if (isDeveloper(candidate)) {
    throw AppError.forbidden("Desenvolvedores não podem ser associados a demandas");
  }
  if (candidate.role === ROLES.ADMINISTRATOR) {
    if (candidate.id !== auth.id) {
      throw AppError.forbidden("O administrador só entra em uma demanda quando ele mesmo se associa a ela");
    }
    return;
  }
  if (!candidate.departmentIds.includes(departmentId)) {
    throw AppError.unprocessable("A pessoa não participa deste ministério");
  }
  if (candidate.role === ROLES.GENERAL_MANAGER && candidate.id !== auth.id) {
    throw AppError.forbidden("O líder geral só entra em uma demanda quando ele mesmo se associa a ela");
  }
}

function assertCanRemoveAssignee(auth, currentAssignee) {
  if (!currentAssignee) return;
  if (currentAssignee.role === ROLES.ADMINISTRATOR && !isAdmin(auth)) {
    throw AppError.forbidden("Apenas um administrador pode remover um administrador desta demanda");
  }
  if (currentAssignee.role === ROLES.GENERAL_MANAGER && !isAtLeast(auth.role, ROLES.GENERAL_MANAGER)) {
    throw AppError.forbidden("Apenas o líder geral ou administrador pode remover um líder geral desta demanda");
  }
}

const sameMoment = (a, b) => (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);

function localDateString(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function assertDueAtNotInPast(dueAt, currentNow, timeZone) {
  if (!dueAt) return;
  const dueDate = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (Number.isNaN(dueDate.getTime())) {
    throw AppError.unprocessable("Prazo inválido");
  }
  if (localDateString(dueDate, timeZone) < localDateString(currentNow, timeZone)) {
    throw AppError.unprocessable("O prazo deve ser a partir do dia atual");
  }
}

function isExpiredCompletedDemand(demand, currentNow) {
  if (!demand || demand.status !== "COMPLETED" || !demand.completedAt) return false;
  return new Date(demand.completedAt).getTime() <= completedDemandCutoff(currentNow).getTime();
}

export function createDemandsService({
  repository = demandsRepository,
  notifier = defaultNotifier,
  recipients = notificationsRepository,
  now = () => new Date(),
  timeZone = env.APP_TIME_ZONE,
} = {}) {
  async function findDemand(id) {
    const demand = await repository.findById(id);
    if (!demand) throw AppError.notFound("Demanda não encontrada");
    if (isExpiredCompletedDemand(demand, now())) {
      await repository.delete(id);
      throw AppError.notFound("Demanda não encontrada");
    }
    return demand;
  }

  return {
    async list(auth, { departmentId, status } = {}) {
      if (departmentId && !isAdmin(auth) && !participatesIn(auth, departmentId)) {
        throw AppError.forbidden("Você só vê demandas dos ministérios dos quais participa");
      }

      await repository.deleteCompletedBefore?.(completedDemandCutoff(now()));

      return repository.list({
        departmentIds: isAdmin(auth) ? null : auth.departmentIds,
        departmentId,
        status,
      });
    },

    async listCandidates(auth, { departmentId }) {
      const department = await repository.findDepartment(departmentId);
      assertDepartmentUsesDemands(department);
      assertCanCreateDemandsIn(auth, departmentId);

      const candidates = await repository.listDepartmentCandidates(departmentId);
      const canSelfAssignPrivileged =
        auth.role === ROLES.ADMINISTRATOR ||
        (auth.role === ROLES.GENERAL_MANAGER && participatesIn(auth, departmentId));

      if (!canSelfAssignPrivileged) {
        return candidates;
      }

      const self = await repository.findCandidateById(auth.id);
      if (!self || self.status === "INACTIVE" || isDeveloper(self)) {
        return candidates;
      }

      const merged = new Map(candidates.map((item) => [item.id, item]));
      merged.set(self.id, {
        id: self.id,
        name: self.name,
        username: self.username,
        role: self.role,
      });

      return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    },

    async getById(auth, id) {
      const demand = await findDemand(id);
      if (!demand.department?.hasDemands) {
        throw AppError.notFound("Demanda não encontrada");
      }
      if (!canViewDemandsOf(auth, demand.department.id)) {
        throw AppError.forbidden("Você só vê demandas dos ministérios dos quais participa");
      }
      return demand;
    },

    async create(auth, { title, description, departmentId, assigneeIds, status, dueAt }) {
      const department = await repository.findDepartment(departmentId);
      assertDepartmentUsesDemands(department);
      assertCanCreateDemandsIn(auth, departmentId);

      if (status === "COMPLETED") {
        throw AppError.unprocessable("Novas demandas começam em progresso e só podem ser finalizadas após a criação");
      }

      assertDueAtNotInPast(dueAt, now(), timeZone);

      const normalizedAssigneeIds = [...new Set((assigneeIds ?? []).filter(Boolean))];
      for (const candidateId of normalizedAssigneeIds) {
        const candidate = await repository.findCandidateById(candidateId);
        assertCanAssignToDemand(auth, departmentId, candidate);
      }

      const created = await repository.create({
        title,
        description: description || null,
        departmentId,
        assigneeIds: normalizedAssigneeIds,
        createdById: auth.id,
        status: "IN_PROGRESS",
        dueAt: dueAt ?? null,
        completedAt: null,
      });

      const notifyIds = (created.assignees ?? []).map((person) => person.id);
      if (notifyIds.length > 0) {
        await notifier.safely(() =>
          notifier.to(notifyIds, messages.demandAssigned(created), { except: auth.id }),
        );
      }

      return created;
    },

    async update(auth, id, changes) {
      const current = await findDemand(id);
      assertDepartmentUsesDemands(current.department);

      const currentAssignees = current.assignees ?? [];
      const currentById = new Map(currentAssignees.map((person) => [person.id, person]));
      const currentAssigneeIds = [...currentById.keys()];

      const isLeader = canManageDemandsOf(auth, current.department.id);
      const isCreator = current.createdBy?.id === auth.id;
      const isAssignee = currentAssigneeIds.includes(auth.id);

      if (!isLeader && !isCreator && !isAssignee) {
        throw AppError.forbidden("Você só pode editar demandas que criou ou das quais é responsável");
      }

      if (changes.dueAt && !sameMoment(changes.dueAt, current.dueAt)) {
        assertDueAtNotInPast(changes.dueAt, now(), timeZone);
      }

      const nextAssigneeIds =
        changes.assigneeIds === undefined
          ? currentAssigneeIds
          : [...new Set((changes.assigneeIds ?? []).filter(Boolean))];
      const addedIds = nextAssigneeIds.filter((uid) => !currentById.has(uid));
      const removedIds = currentAssigneeIds.filter((uid) => !nextAssigneeIds.includes(uid));
      const assigneesChanged = addedIds.length > 0 || removedIds.length > 0;

      for (const removedId of removedIds) {
        assertCanRemoveAssignee(auth, currentById.get(removedId));
      }
      for (const addedId of addedIds) {
        const candidate = await repository.findCandidateById(addedId);
        assertCanAssignToDemand(auth, current.department.id, candidate);
      }

      const nextStatus = changes.status ?? current.status;
      const statusChanged = changes.status !== undefined && nextStatus !== current.status;

      if (nextStatus === "COMPLETED" && nextAssigneeIds.length === 0) {
        throw AppError.unprocessable("Associe ao menos um responsável antes de finalizar a demanda");
      }

      if (!isLeader && statusChanged) {
        if (nextStatus === "COMPLETED" && !nextAssigneeIds.includes(auth.id)) {
          throw AppError.forbidden(
            "Apenas um dos responsáveis pela demanda ou a liderança do ministério pode finalizar esta tarefa",
          );
        }
        if (
          current.status === "COMPLETED" &&
          nextStatus === "IN_PROGRESS" &&
          currentAssigneeIds.length > 0 &&
          !currentAssigneeIds.includes(auth.id)
        ) {
          throw AppError.forbidden(
            "Apenas um dos responsáveis pela demanda ou a liderança do ministério pode reabrir esta tarefa",
          );
        }
      }

      const detailsChanged =
        (changes.title !== undefined && changes.title !== current.title) ||
        (changes.description !== undefined && (changes.description || null) !== (current.description ?? null)) ||
        (changes.dueAt !== undefined && !sameMoment(changes.dueAt, current.dueAt));

      const data = {
        ...(changes.title !== undefined && { title: changes.title }),
        ...(changes.description !== undefined && { description: changes.description || null }),
        ...(changes.dueAt !== undefined && { dueAt: changes.dueAt }),
        ...(changes.assigneeIds !== undefined && { assigneeIds: nextAssigneeIds }),
        ...(changes.status !== undefined && { status: nextStatus }),
        ...(statusChanged && {
          completedAt: nextStatus === "COMPLETED" ? now() : null,
        }),
      };

      const updated = await repository.update(id, data);

      await notifier.safely(async () => {
        const options = { except: auth.id };

        if (removedIds.length > 0) {
          await notifier.to(removedIds, messages.demandUnassigned(updated), options);
        }
        if (addedIds.length > 0) {
          await notifier.to(addedIds, messages.demandAssigned(updated), options);
        }

        if (statusChanged) {
          const leaders = recipients?.departmentLeadersOf
            ? await recipients.departmentLeadersOf(updated.department.id)
            : [];
          const targets = [updated.createdBy?.id, ...nextAssigneeIds, ...leaders].filter(Boolean);
          const msg =
            nextStatus === "COMPLETED" ? messages.demandCompleted(updated) : messages.demandReopened(updated);
          await notifier.to(targets, msg, options);
        } else if (detailsChanged || (assigneesChanged && updated.createdBy?.id)) {
          const excludedForUpdate = new Set([...addedIds, ...removedIds]);
          const targets = [updated.createdBy?.id, ...nextAssigneeIds].filter(
            (uid) => uid && !excludedForUpdate.has(uid),
          );
          if (targets.length > 0) {
            await notifier.to(targets, messages.demandUpdated(updated), options);
          }
        }
      });

      return updated;
    },

    async delete(auth, id) {
      const current = await findDemand(id);
      const isLeader = canManageDemandsOf(auth, current.department.id);
      const isCreator = current.createdBy?.id === auth.id;

      if (!isLeader && !isCreator) {
        throw AppError.forbidden("Apenas quem criou a demanda ou a liderança do ministério pode excluí-la");
      }

      await repository.delete(id);

      await notifier.safely(async () => {
        const targets = [
          ...(current.assignees ?? []).map((person) => person.id),
          current.createdBy?.id,
        ].filter(Boolean);
        if (targets.length > 0) {
          await notifier.to(targets, messages.demandDeleted(current), { except: auth.id });
        }
      });
    },
  };
}

export const demandsService = createDemandsService();
