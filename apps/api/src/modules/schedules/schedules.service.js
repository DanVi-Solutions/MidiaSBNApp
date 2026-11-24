import {
  assertCanManageSchedulesOf,
  canManageSchedulesOf,
  managedScheduleDepartmentIds,
  participatesIn,
} from "../../shared/auth/departmentAccess.js";
import { ROLES, isAdmin, isAtLeast } from "../../shared/auth/roles.js";
import { AppError } from "../../shared/errors/AppError.js";
import { isUniqueViolationOn } from "../../shared/errors/prismaErrors.js";
import { assertInsideWindow, scheduleWindow } from "../../shared/time/scheduleWindow.js";
import { formatMoment } from "../../shared/time/formatting.js";
import { conflictsWithWorship } from "../../shared/time/worshipServices.js";
import { localDateOf, weekdayAndPeriodOf } from "../../shared/time/zonedTime.js";
import { departmentsRepository } from "../departments/departments.repository.js";
import { messages } from "../notifications/notifications.messages.js";
import { notifier as defaultNotifier } from "../notifications/notifications.notifier.js";
import { notificationsRepository } from "../notifications/notifications.repository.js";
import { checkInWindowOf, stillCheckingIn } from "./schedules.attendance.js";
import { distribute, randomSeed, seededRandom } from "./schedules.distribution.js";
import { schedulesRepository } from "./schedules.repository.js";


const NEVER_DISTRIBUTED_ROLES = [ROLES.DEVELOPER, ROLES.ADMINISTRATOR, ROLES.GENERAL_MANAGER];

const isSelectableBy = (auth) => (credential) =>
  !isAdmin(credential) && (credential.role !== ROLES.GENERAL_MANAGER || credential.id === auth.id);

function assertCanAddToSchedule(auth, member) {
  if (isAdmin(member)) {
    throw AppError.forbidden("Administradores e desenvolvedores não podem ser escalados");
  }
  if (member.role === ROLES.GENERAL_MANAGER && member.id !== auth.id) {
    throw AppError.forbidden("O líder geral só entra em uma escala quando ele mesmo se coloca nela");
  }
}

function assertCanResolveDeclinesOf(auth, departmentId) {
  const isLeader = [ROLES.DEPARTMENT_MANAGER, ROLES.GENERAL_MANAGER].includes(auth.role) && participatesIn(auth, departmentId);
  if (!isAdmin(auth) && !isLeader) {
    throw AppError.forbidden("Apenas o gerente do ministério ou o líder geral pode substituir quem não vai participar");
  }
}

function assertCanRemoveFromSchedule(auth, memberRole) {
  if (memberRole === ROLES.GENERAL_MANAGER && !isAtLeast(auth.role, ROLES.GENERAL_MANAGER)) {
    throw AppError.forbidden("Apenas o líder geral ou administrador pode tirar um líder geral da escala");
  }
}

const ALWAYS_AVAILABLE = Object.freeze({
  hasWeeklyAvailability: true,
  isUnavailable: false,
  available: true,
  worshipService: null,
  worshipConflict: false,
});

function assessAvailability(member, period) {
  const hasWeeklyAvailability = member.availabilities.some((day) => day[period]);
  const isUnavailable = member.unavailabilities.length > 0;
  return { hasWeeklyAvailability, isUnavailable, available: hasWeeklyAvailability && !isUnavailable };
}

const ONE_DAY = 24 * 60 * 60 * 1000;

const isAvailableAt = (member, period) =>
  member.unavailabilities.length === 0 && member.availabilities.some((day) => day[period]);

function ensureVolunteersNeededWhenSelfSignup({ selfSignup, volunteersNeeded }) {
  if (selfSignup && !volunteersNeeded) {
    throw AppError.unprocessable("Escalas de inscrição voluntária precisam de volunteersNeeded");
  }
}

const suitabilityRank = (candidate) => (candidate.available ? 0 : 2) + (candidate.worshipConflict ? 1 : 0);

const byAvailabilityThenName = (a, b) =>
  suitabilityRank(a) - suitabilityRank(b) || a.credential.name.localeCompare(b.credential.name);

const withCheckInWindow = (assignment) => ({ ...assignment, checkIn: checkInWindowOf(assignment.schedule.scheduleAt) });

const ASSIGNMENT_NOT_FOUND = "Participação na escala não encontrada";

const comesFromAgenda = (schedule) => Boolean(schedule.agendaEventId);

function assertCanDeleteSchedule(auth, schedule) {
  if (comesFromAgenda(schedule) && !isAtLeast(auth.role, ROLES.GENERAL_MANAGER)) {
    throw AppError.forbidden("Escalas da Agenda Sobrenatural só podem ser apagadas pelo líder geral ou acima");
  }
}

const assigneeIdsOf = (schedule) => (schedule.assignments ?? []).map((assignment) => assignment.credential.id);

const OUTDATED_AFTER_LEAVING = [
  "SCHEDULE_ASSIGNED",
  "SCHEDULE_CHANGED",
  "SCHEDULE_REMINDER",
  "SELF_SIGNUP_OPENED",
  "CHANGE_REQUEST_REJECTED",
];

export function createSchedulesService({
  repository = schedulesRepository,
  departments = departmentsRepository,
  notifier = defaultNotifier,
  recipients = notificationsRepository,
} = {}) {
  async function findSchedule(id) {
    const schedule = await repository.findById(id);
    if (!schedule) throw AppError.notFound("Escala não encontrada");
    return schedule;
  }

  async function findManageableSchedule(auth, id) {
    const schedule = await findSchedule(id);
    assertCanManageSchedulesOf(auth, schedule.department.id);
    return schedule;
  }

  async function findEditableSchedule(auth, id) {
    const schedule = await findManageableSchedule(auth, id);
    assertInsideWindow(schedule.scheduleAt);
    return schedule;
  }

  async function findSelfSignupSchedule(auth, id) {
    const schedule = await findSchedule(id);
    if (!participatesIn(auth, schedule.department.id) || !schedule.published) {
      throw AppError.notFound("Escala não encontrada");
    }
    if (!schedule.selfSignup) {
      throw AppError.conflict("Esta escala não aceita inscrições: as pessoas são definidas pelos gestores");
    }
    if (schedule.scheduleAt <= new Date()) throw AppError.conflict("A escala já começou");
    return schedule;
  }

  async function loadDistributionSlots(auth, requests) {
    const schedules = await repository.findManyByIds(requests.map((request) => request.scheduleId));
    if (schedules.length !== requests.length) throw AppError.notFound("Uma ou mais escalas não existem");

    const requested = new Map(requests.map((request) => [request.scheduleId, request.volunteers]));
    const excludeRoles = NEVER_DISTRIBUTED_ROLES;

    return Promise.all(
      schedules.map(async (schedule) => {
        assertCanManageSchedulesOf(auth, schedule.department.id);
        assertInsideWindow(schedule.scheduleAt);
        if (schedule.selfSignup) {
          throw AppError.unprocessable(`A escala "${schedule.name}" é de inscrição voluntária e não entra na distribuição`);
        }

        const { weekday, period } = weekdayAndPeriodOf(schedule.scheduleAt);
        const members = await repository.schedulableMembersAt(schedule.department.id, {
          at: schedule.scheduleAt,
          weekday,
          excludeRoles,
        });
        const assignedIds = new Set(schedule.assignments.map((assignment) => assignment.credential.id));
        const candidates = members
          .filter((member) => !assignedIds.has(member.id) && isAvailableAt(member, period))
          .map(({ availabilities, unavailabilities, ...credential }) => credential);

        return {
          schedule,
          scheduleId: schedule.id,
          scheduleAt: schedule.scheduleAt,
          requested: requested.get(schedule.id),
          alreadyAssigned: schedule.assignments.length,
          needed: Math.max(0, requested.get(schedule.id) - schedule.assignments.length),
          candidates,
        };
      }),
    );
  }

  async function loadCommitments(slots) {
    const candidateIds = [...new Set(slots.flatMap((slot) => slot.candidates.map((candidate) => candidate.id)))];
    const times = slots.map((slot) => slot.scheduleAt.getTime());
    const [assignments, upcomingLoad] = await Promise.all([
      repository.findAssignmentsOf(candidateIds, {
        from: new Date(Math.min(...times) - ONE_DAY),
        to: new Date(Math.max(...times) + ONE_DAY),
      }),
      repository.countUpcomingAssignments(candidateIds, new Date()),
    ]);
    const existingAssignments = assignments.map((a) => ({ credentialId: a.credentialId, scheduleAt: a.schedule.scheduleAt }));
    return { existingAssignments, upcomingLoad };
  }

  function announceOpenSlots(auth, schedule) {
    return notifier.safely(async () => {
      const members = await recipients.membersOf(schedule.department.id);
      const assigned = new Set(assigneeIdsOf(schedule));
      await notifier.to(
        members.filter((id) => !assigned.has(id)),
        messages.selfSignupOpened(schedule),
        { except: auth.id },
      );
    });
  }

  async function announceUpdate(auth, before, after) {
    const assignees = assigneeIdsOf(after);
    const options = { except: auth.id };

    if (!after.published) return;

    if (!before.published) {
      await notifier.to(assignees, messages.scheduleAssigned(after), options);
      if (after.selfSignup) await announceOpenSlots(auth, after);
      return;
    }

    if (before.scheduleAt.getTime() !== after.scheduleAt.getTime()) {
      await notifier.to(assignees, messages.scheduleMoved(after), options);
    } else if (before.name !== after.name) {
      await notifier.to(assignees, messages.scheduleRenamed(after, before.name), options);
    }
    if (!before.selfSignup && after.selfSignup) await announceOpenSlots(auth, after);
  }

  async function resolveDeclinedNotice(scheduleId) {
    await notifier.safely(async () => {
      if ((await repository.countDeclined(scheduleId)) === 0) {
        await notifier.discardForEveryone(scheduleId, ["ASSIGNMENT_DECLINED"]);
      }
    });
  }

  async function availabilityAt(schedule, auth) {
    const { weekday, period } = weekdayAndPeriodOf(schedule.scheduleAt);
    const members = await repository.membersWithAvailabilityAt(schedule.department.id, {
      at: schedule.scheduleAt,
      weekday,
      excludeRoles: [ROLES.DEVELOPER, ROLES.ADMINISTRATOR],
    });
    return members
      .filter(isSelectableBy(auth))
      .map(({ availabilities, unavailabilities, worshipService, ...credential }) =>
        credential.role === ROLES.GENERAL_MANAGER
          ? { credential, ...ALWAYS_AVAILABLE }
          : {
              credential,
              ...assessAvailability({ availabilities, unavailabilities }, period),
              worshipService,
              worshipConflict: conflictsWithWorship(schedule.scheduleAt, worshipService),
            },
      );
  }

  return {
    window() {
      return scheduleWindow();
    },

    list(auth, { departmentId, from = new Date(), to }) {
      if (departmentId && !isAdmin(auth) && !participatesIn(auth, departmentId)) {
        throw AppError.forbidden("Você só vê escalas dos ministérios dos quais participa");
      }

      const visibility = isAdmin(auth)
        ? {}
        : { manageableDepartmentIds: managedScheduleDepartmentIds(auth), memberDepartmentIds: auth.departmentIds };
      return repository.list({ visibility, departmentId, from, to });
    },

    async listMine(auth, { from = stillCheckingIn() }) {
      return (await repository.listAssignmentsOf(auth.id, { from })).map(withCheckInWindow);
    },

    async confirmPresence(auth, assignmentId) {
      const assignment = await repository.findOwnAssignment(assignmentId, auth.id);
      if (!assignment) throw AppError.notFound(ASSIGNMENT_NOT_FOUND);
      if (assignment.schedule.scheduleAt <= new Date()) throw AppError.conflict("A escala já começou");
      if (assignment.changeStatus === "REQUESTED") {
        throw AppError.conflict("Você pediu substituição nesta escala. Cancele o pedido antes de confirmar presença");
      }

      if (!assignment.confirmedAt || assignment.changeStatus !== "NONE") await repository.confirmPresence(assignmentId);
      await notifier.discardAboutSchedule(auth.id, assignment.schedule.id, ["CHANGE_REQUEST_REJECTED"]);
      await resolveDeclinedNotice(assignment.schedule.id);
      return withCheckInWindow(await repository.findOwnAssignment(assignmentId, auth.id));
    },

    async decline(auth, assignmentId) {
      const assignment = await repository.findOwnAssignment(assignmentId, auth.id);
      if (!assignment) throw AppError.notFound(ASSIGNMENT_NOT_FOUND);
      if (assignment.schedule.scheduleAt <= new Date()) throw AppError.conflict("A escala já começou");
      if (assignment.changeStatus === "REQUESTED") {
        throw AppError.conflict(
          "Você já indicou um substituto para esta escala. Cancele o pedido antes de avisar que não vai participar",
        );
      }
      if (assignment.changeStatus === "DECLINED") {
        throw AppError.conflict("Você já avisou que não vai participar. Os líderes do ministério vão escolher alguém");
      }

      if (!(await repository.markDeclined(assignmentId))) throw AppError.conflict("A participação mudou. Atualize a página");

      const { schedule } = assignment;
      await notifier.discardAboutSchedule(auth.id, schedule.id, ["CHANGE_REQUEST_REJECTED", "SCHEDULE_REMINDER"]);
      await notifier.safely(async () => {
        const leaders = await recipients.departmentLeadersOf(schedule.department.id);
        await notifier.to(leaders, messages.assignmentDeclined(assignment.credential.name, schedule), { except: auth.id });
      });
    },

    async checkIn(auth, assignmentId) {
      const assignment = await repository.findOwnAssignment(assignmentId, auth.id);
      if (!assignment) throw AppError.notFound(ASSIGNMENT_NOT_FOUND);
      if (assignment.checkedInAt) throw AppError.conflict("Você já fez o check-in nesta escala");
      if (!assignment.confirmedAt) throw AppError.conflict("Confirme sua presença antes de fazer o check-in");

      const { opensAt, closesAt } = checkInWindowOf(assignment.schedule.scheduleAt);
      const now = new Date();
      if (now < opensAt) {
        throw AppError.conflict(`O check-in abre 10 minutos antes do início (${formatMoment(opensAt)})`);
      }
      if (now > closesAt) throw AppError.conflict("O prazo para o check-in desta escala terminou");

      if (!(await repository.checkIn(assignmentId))) throw AppError.conflict("Você já fez o check-in nesta escala");
      return withCheckInWindow(await repository.findOwnAssignment(assignmentId, auth.id));
    },

    async listOpen(auth) {
      const schedules = await repository.listOpenForSignup({
        departmentIds: auth.departmentIds,
        credentialId: auth.id,
        from: new Date(),
      });
      return schedules.map((schedule) => ({
        ...schedule,
        freeSlots: Math.max(0, schedule.volunteersNeeded - schedule.assignedCount),
      }));
    },

    async signUp(auth, id) {
      await findSelfSignupSchedule(auth, id);
      try {
        if (!(await repository.signUp(id, auth.id))) throw AppError.conflict("A escala já está completa");
      } catch (error) {
        if (isUniqueViolationOn(error, "credential_schedule")) throw AppError.conflict("Você já está nesta escala");
        throw error;
      }
      await notifier.discardAboutSchedule(auth.id, id, ["SELF_SIGNUP_OPENED"]);
      return repository.findById(id);
    },

    async withdraw() {
      throw AppError.forbidden(
        "Após confirmar sua inscrição, não é possível cancelar diretamente. Solicite uma substituição informando que não conseguirá participar.",
      );
    },

    async autoAssign(auth, { schedules: requests, dryRun, seed = randomSeed() }) {
      const slots = await loadDistributionSlots(auth, requests);
      const picksBySlot = distribute(slots, { ...(await loadCommitments(slots)), random: seededRandom(seed) });

      if (!dryRun) {
        await repository.addAssignments(
          slots.flatMap((slot) =>
            picksBySlot.get(slot.scheduleId).map((pick) => ({ scheduleId: slot.scheduleId, credentialId: pick.credential.id })),
          ),
        );
        await notifier.send(
          slots
            .filter((slot) => slot.schedule.published)
            .flatMap((slot) =>
              picksBySlot.get(slot.scheduleId).map((pick) => ({
                credentialId: pick.credential.id,
                message: messages.scheduleAssigned(slot.schedule),
              })),
            ),
          { except: auth.id },
        );
      }

      const results = requests.map(({ scheduleId }) => {
        const slot = slots.find((each) => each.scheduleId === scheduleId);
        const assigned = picksBySlot.get(scheduleId);
        const { id, name, scheduleAt, department } = slot.schedule;
        return {
          schedule: { id, name, scheduleAt, department, day: localDateOf(scheduleAt) },
          requested: slot.requested,
          alreadyAssigned: slot.alreadyAssigned,
          assigned,
          missing: slot.needed - assigned.length,
        };
      });

      return {
        dryRun,
        seed,
        assignedTotal: results.reduce((total, result) => total + result.assigned.length, 0),
        missingTotal: results.reduce((total, result) => total + result.missing, 0),
        schedules: results,
      };
    },

    async getById(auth, id) {
      const schedule = await findSchedule(id);
      if (canManageSchedulesOf(auth, schedule.department.id)) return schedule;
      if (participatesIn(auth, schedule.department.id) && schedule.published) return schedule;
      throw AppError.notFound("Escala não encontrada");
    },

    async availableCredentials(auth, id) {
      const schedule = await findManageableSchedule(auth, id);
      const assignedIds = new Set(schedule.assignments.map((assignment) => assignment.credential.id));
      const candidates = await availabilityAt(schedule, auth);
      return candidates.filter(({ credential }) => !assignedIds.has(credential.id)).sort(byAvailabilityThenName);
    },

    async create(auth, data) {
      if (!(await departments.findById(data.departmentId))) throw AppError.notFound("Ministério não encontrado");
      assertCanManageSchedulesOf(auth, data.departmentId);
      assertInsideWindow(data.scheduleAt);
      ensureVolunteersNeededWhenSelfSignup(data);
      return repository.create(data);
    },

    async update(auth, id, changes) {
      const current = await findEditableSchedule(auth, id);
      if (changes.scheduleAt) assertInsideWindow(changes.scheduleAt);
      ensureVolunteersNeededWhenSelfSignup({
        selfSignup: changes.selfSignup ?? current.selfSignup,
        volunteersNeeded: changes.volunteersNeeded === undefined ? current.volunteersNeeded : changes.volunteersNeeded,
      });
      const updated = await repository.update(id, changes);
      if (updated.scheduleAt.getTime() !== current.scheduleAt.getTime()) await repository.resetAfterReschedule(id);
      await announceUpdate(auth, current, updated);
      return updated;
    },

    async delete(auth, id) {
      const schedule = await findEditableSchedule(auth, id);
      assertCanDeleteSchedule(auth, schedule);
      await repository.delete(id);
      if (schedule.published) {
        await notifier.to(assigneeIdsOf(schedule), messages.scheduleCancelled(schedule), { except: auth.id });
      }
    },

    async assign(auth, id, credentialId) {
      const schedule = await findEditableSchedule(auth, id);

      const member = await repository.findMember(schedule.department.id, credentialId);
      if (!member) throw AppError.unprocessable("A pessoa não participa do ministério desta escala");
      if (member.status === "INACTIVE") throw AppError.unprocessable("A conta da pessoa está desativada");
      assertCanAddToSchedule(auth, member);

      try {
        await repository.addAssignment(id, credentialId);
      } catch (error) {
        if (isUniqueViolationOn(error, "credential_schedule")) throw AppError.conflict("A pessoa já está nesta escala");
        throw error;
      }

      const assessment = (await availabilityAt(schedule, auth)).find(
        ({ credential }) => credential.id === credentialId,
      );
      const updated = await repository.findById(id);
      if (updated.published) await notifier.to([credentialId], messages.scheduleAssigned(updated), { except: auth.id });
      const overCapacity = updated.volunteersNeeded && updated.assignedCount > updated.volunteersNeeded;
      const warnings = [
        ...(assessment?.hasWeeklyAvailability ? [] : ["NO_WEEKLY_AVAILABILITY"]),
        ...(assessment?.isUnavailable ? ["UNAVAILABLE"] : []),
        ...(assessment?.worshipConflict ? ["WORSHIP_SERVICE"] : []),
        ...(overCapacity ? ["OVER_CAPACITY"] : []),
      ];
      return { schedule: updated, warnings };
    },

    async replaceDeclined(auth, id, credentialId, substituteId) {
      const schedule = await findEditableSchedule(auth, id);
      assertCanResolveDeclinesOf(auth, schedule.department.id);
      if (schedule.scheduleAt <= new Date()) throw AppError.conflict("A escala já começou");

      const declined = schedule.assignments.find((assignment) => assignment.credential.id === credentialId);
      if (!declined) throw AppError.notFound("A pessoa não está nesta escala");
      if (declined.changeStatus !== "DECLINED") {
        throw AppError.conflict("Só é possível substituir quem avisou que não vai participar");
      }

      const substitute = await repository.findMember(schedule.department.id, substituteId);
      if (!substitute) throw AppError.unprocessable("O substituto precisa participar do ministério desta escala");
      if (substitute.status === "INACTIVE") throw AppError.unprocessable("A conta do substituto está desativada");
      assertCanAddToSchedule(auth, substitute);

      try {
        await repository.replaceAssignment(declined.id, substituteId);
      } catch (error) {
        if (isUniqueViolationOn(error, "credential_schedule")) throw AppError.conflict("O substituto já está nesta escala");
        throw error;
      }

      const updated = await repository.findById(id);
      await notifier.discardAboutSchedule(credentialId, id, OUTDATED_AFTER_LEAVING);
      await notifier.to([credentialId], messages.scheduleReplaced(updated), { except: auth.id });
      if (updated.published) await notifier.to([substituteId], messages.scheduleAssigned(updated), { except: auth.id });
      await resolveDeclinedNotice(id);
      return updated;
    },

    async candidatesAt(auth, { departmentId, scheduleAt }) {
      if (!(await departments.findById(departmentId))) throw AppError.notFound("Ministério não encontrado");
      assertCanManageSchedulesOf(auth, departmentId);
      const candidates = await availabilityAt({ scheduleAt, department: { id: departmentId } }, auth);
      return candidates.sort(byAvailabilityThenName);
    },

    async unassign(auth, id, credentialId) {
      const schedule = await findEditableSchedule(auth, id);
      const existingAssignment = (schedule.assignments || []).find(
        (assignment) => assignment.credential?.id === credentialId,
      );
      let targetRole = existingAssignment?.credential?.role;
      if (!targetRole) {
        const member = await repository.findMember(schedule.department.id, credentialId);
        targetRole = member?.role;
      }
      if (targetRole) {
        assertCanRemoveFromSchedule(auth, targetRole);
      }
      if (!(await repository.removeAssignment(id, credentialId))) {
        throw AppError.notFound("A pessoa não está nesta escala");
      }
      await notifier.discardAboutSchedule(credentialId, id, OUTDATED_AFTER_LEAVING);
      if (schedule.published) await notifier.to([credentialId], messages.scheduleUnassigned(schedule), { except: auth.id });
      await resolveDeclinedNotice(id);
    },
  };
}

export const schedulesService = createSchedulesService();
