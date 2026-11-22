import { assertCanManageSchedulesOf, managedScheduleDepartmentIds } from "../../shared/auth/departmentAccess.js";
import { isAdmin } from "../../shared/auth/roles.js";
import { AppError } from "../../shared/errors/AppError.js";
import { isInsideWindow, monthsOfWindow, scheduleWindow } from "../../shared/time/scheduleWindow.js";
import { occurrencesInMonth } from "../../shared/time/zonedTime.js";
import { departmentsRepository } from "../departments/departments.repository.js";
import { assertCanManageEventOf, assertCanSeeEvent, assertCanSeeEvents } from "./recurring-events.policy.js";
import { recurringEventsRepository } from "./recurring-events.repository.js";

export function createRecurringEventsService({
  repository = recurringEventsRepository,
  departments = departmentsRepository,
} = {}) {
  async function findEvent(id) {
    const event = await repository.findById(id);
    if (!event) throw AppError.notFound("Evento recorrente não encontrado");
    return event;
  }

  async function ensureDepartmentExists(departmentId) {
    if (departmentId && !(await departments.findById(departmentId))) {
      throw AppError.notFound("Ministério não encontrado");
    }
  }

  async function resolveTargetDepartments(auth, event, requestedIds) {
    const ids = event.departmentId
      ? [event.departmentId]
      : (requestedIds ??
        (isAdmin(auth) ? await repository.listAllDepartmentIds() : managedScheduleDepartmentIds(auth)));
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

    async create(auth, { departmentId = null, ...data }) {
      await ensureDepartmentExists(departmentId);
      assertCanManageEventOf(auth, departmentId);
      return repository.create({ ...data, departmentId });
    },

    async update(auth, id, changes) {
      const event = await findEvent(id);
      assertCanManageEventOf(auth, event.departmentId);
      return repository.update(id, changes);
    },

    async delete(auth, id) {
      const event = await findEvent(id);
      assertCanManageEventOf(auth, event.departmentId);
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
