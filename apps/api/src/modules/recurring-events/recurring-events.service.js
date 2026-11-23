import { assertCanManageSchedulesOf, managedScheduleDepartmentIds } from "../../shared/auth/departmentAccess.js";
import { isAdmin } from "../../shared/auth/roles.js";
import { AppError } from "../../shared/errors/AppError.js";
import { isInsideWindow, monthsOfWindow, scheduleWindow } from "../../shared/time/scheduleWindow.js";
import { occurrencesInMonth } from "../../shared/time/zonedTime.js";
import {
  assertCanCreateEvent,
  assertCanManageEvent,
  assertCanPromoteEvent,
  assertCanSeeEvent,
  assertCanSeeEvents,
} from "./recurring-events.policy.js";
import { recurringEventsRepository } from "./recurring-events.repository.js";

export function createRecurringEventsService({ repository = recurringEventsRepository } = {}) {
  async function findEvent(id) {
    const event = await repository.findById(id);
    if (!event) throw AppError.notFound("Evento recorrente não encontrado");
    return event;
  }

  async function resolveTargetDepartments(auth, event, requestedIds) {
    const eventDeptIds = (event.departments || []).map((department) => department.id);
    const allowedIds = event.isGlobal
      ? isAdmin(auth)
        ? await repository.listAllDepartmentIds()
        : managedScheduleDepartmentIds(auth)
      : isAdmin(auth)
        ? eventDeptIds
        : eventDeptIds.filter((id) => managedScheduleDepartmentIds(auth).includes(id));

    let ids;
    if (requestedIds) {
      requestedIds.forEach((departmentId) => assertCanManageSchedulesOf(auth, departmentId));
      if (requestedIds.some((departmentId) => !allowedIds.includes(departmentId))) {
        throw AppError.forbidden("Um ou mais ministérios não fazem parte do escopo deste evento recorrente");
      }
      ids = requestedIds;
    } else {
      ids = allowedIds;
    }

    if (ids.length === 0) throw AppError.unprocessable("Nenhum ministério para gerar as escalas");
    ids.forEach((departmentId) => assertCanManageSchedulesOf(auth, departmentId));
    return ids;
  }

  return {
    list(auth) {
      assertCanSeeEvents(auth);
      return repository.list({ departmentIds: isAdmin(auth) ? null : auth.departmentIds });
    },

    async getById(auth, id) {
      const event = await findEvent(id);
      assertCanSeeEvent(auth, event);
      return event;
    },

    async create(auth, data) {
      assertCanCreateEvent(auth);
      if (isAdmin(auth)) {
        return repository.create({ ...data, isGlobal: true, createdById: auth.id, departmentIds: [] });
      }
      const uniqueDeptIds = [...new Set((auth.departmentIds || []).filter(Boolean))];
      if (uniqueDeptIds.length === 0) {
        throw AppError.unprocessable("Você precisa gerenciar ao menos um ministério para criar um evento recorrente");
      }
      return repository.create({ ...data, isGlobal: false, createdById: auth.id, departmentIds: uniqueDeptIds });
    },

    async update(auth, id, changes) {
      const event = await findEvent(id);
      assertCanManageEvent(auth, event);
      return repository.update(id, changes);
    },

    async promote(auth, id) {
      assertCanPromoteEvent(auth);
      const event = await findEvent(id);
      if (event.isGlobal) {
        throw AppError.conflict("Este evento recorrente já está disponível para todos os ministérios");
      }
      return repository.promote(id);
    },

    async delete(auth, id) {
      const event = await findEvent(id);
      assertCanManageEvent(auth, event);
      await repository.delete(id);
    },

    async apply(auth, id, { month, departmentIds, selfSignup, volunteersNeeded = null }) {
      const event = await findEvent(id);
      assertCanSeeEvent(auth, event);

      const targetIds = await resolveTargetDepartments(auth, event, departmentIds);
      const targets = await repository.findDepartments(targetIds);
      if (targets.length !== targetIds.length) throw AppError.notFound("Um ou mais ministérios não existem");

      const window = scheduleWindow();
      const months = month ? [month] : monthsOfWindow(window);
      const occurrences = months.flatMap((each) => occurrencesInMonth(each, event.weekday, event.times));
      const insideWindow = occurrences.filter((date) => isInsideWindow(date, window));
      const schedules = insideWindow.flatMap((scheduleAt) =>
        targetIds.map((departmentId) => ({
          name: event.name,
          description: event.description,
          scheduleAt,
          departmentId,
          recurringEventId: event.id,
          selfSignup,
          volunteersNeeded,
        })),
      );

      const created = await repository.createSchedules(schedules);
      return {
        months,
        departments: targets,
        created,
        skipped: schedules.length - created,
        outsideWindow: occurrences.length - insideWindow.length,
        lastEditableDay: window.lastEditableDay,
      };
    },
  };
}

export const recurringEventsService = createRecurringEventsService();
