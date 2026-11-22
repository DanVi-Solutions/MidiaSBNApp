import {
  assertCanManageSchedulesOf,
  canManageSchedulesOf,
  managedScheduleDepartmentIds,
  participatesIn,
} from "../../shared/auth/departmentAccess.js";
import { isAdmin } from "../../shared/auth/roles.js";
import { AppError } from "../../shared/errors/AppError.js";
import { isUniqueViolationOn } from "../../shared/errors/prismaErrors.js";
import { assertInsideWindow, scheduleWindow } from "../../shared/time/scheduleWindow.js";
import { weekdayAndPeriodOf } from "../../shared/time/zonedTime.js";
import { departmentsRepository } from "../departments/departments.repository.js";
import { schedulesRepository } from "./schedules.repository.js";

const SAME_TIME_CONFLICT = "Este ministério já tem uma escala neste dia e horário";

function assessAvailability(member, period) {
  const hasWeeklyAvailability = member.availabilities.some((day) => day[period]);
  const isUnavailable = member.unavailabilities.length > 0;
  return { hasWeeklyAvailability, isUnavailable, available: hasWeeklyAvailability && !isUnavailable };
}

const byAvailabilityThenName = (a, b) => Number(b.available) - Number(a.available) || a.credential.name.localeCompare(b.credential.name);

export function createSchedulesService({ repository = schedulesRepository, departments = departmentsRepository } = {}) {
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

  async function translateSameTimeConflict(operation) {
    try {
      return await operation();
    } catch (error) {
      if (isUniqueViolationOn(error, "schedule_department_id_schedule_at")) throw AppError.conflict(SAME_TIME_CONFLICT);
      throw error;
    }
  }

  async function availabilityAt(schedule) {
    const { weekday, period } = weekdayAndPeriodOf(schedule.scheduleAt);
    const members = await repository.membersWithAvailabilityAt(schedule.department.id, {
      at: schedule.scheduleAt,
      weekday,
    });
    return members.map(({ availabilities, unavailabilities, ...credential }) => ({
      credential,
      ...assessAvailability({ availabilities, unavailabilities }, period),
    }));
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

    listMine(auth, { from = new Date() }) {
      return repository.listAssignmentsOf(auth.id, { from });
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
      const candidates = await availabilityAt(schedule);
      return candidates.filter(({ credential }) => !assignedIds.has(credential.id)).sort(byAvailabilityThenName);
    },

    async create(auth, data) {
      if (!(await departments.findById(data.departmentId))) throw AppError.notFound("Ministério não encontrado");
      assertCanManageSchedulesOf(auth, data.departmentId);
      assertInsideWindow(data.scheduleAt);
      return translateSameTimeConflict(() => repository.create(data));
    },

    async update(auth, id, changes) {
      await findEditableSchedule(auth, id);
      if (changes.scheduleAt) assertInsideWindow(changes.scheduleAt);
      return translateSameTimeConflict(() => repository.update(id, changes));
    },

    async delete(auth, id) {
      await findEditableSchedule(auth, id);
      await repository.delete(id);
    },

    async assign(auth, id, credentialId) {
      const schedule = await findEditableSchedule(auth, id);

      const member = await repository.findMember(schedule.department.id, credentialId);
      if (!member) throw AppError.unprocessable("A pessoa não participa do ministério desta escala");
      if (member.status === "INACTIVE") throw AppError.unprocessable("A conta da pessoa está desativada");

      try {
        await repository.addAssignment(id, credentialId);
      } catch (error) {
        if (isUniqueViolationOn(error, "credential_schedule")) throw AppError.conflict("A pessoa já está nesta escala");
        throw error;
      }

      const assessment = (await availabilityAt(schedule)).find(({ credential }) => credential.id === credentialId);
      const warnings = [
        ...(assessment.hasWeeklyAvailability ? [] : ["NO_WEEKLY_AVAILABILITY"]),
        ...(assessment.isUnavailable ? ["UNAVAILABLE"] : []),
      ];
      return { schedule: await repository.findById(id), warnings };
    },

    async unassign(auth, id, credentialId) {
      await findEditableSchedule(auth, id);
      if (!(await repository.removeAssignment(id, credentialId))) {
        throw AppError.notFound("A pessoa não está nesta escala");
      }
    },
  };
}

export const schedulesService = createSchedulesService();
