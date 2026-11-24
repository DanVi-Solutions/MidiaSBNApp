import { AppError } from "../../shared/errors/AppError.js";
import { agendaCycleRange, agendaWindow, assertInsideAgendaWindow } from "../../shared/time/agendaWindow.js";
import { isInsideWindow } from "../../shared/time/scheduleWindow.js";
import { messages } from "../notifications/notifications.messages.js";
import { notifier as defaultNotifier } from "../notifications/notifications.notifier.js";
import { scheduleAgendaEvents } from "./agenda.jobs.js";
import { assertCanEditAgenda, assertCanIndicateDepartments, assertUpcoming, canEditAgenda } from "./agenda.policy.js";
import { agendaRepository } from "./agenda.repository.js";

const difference = (list, other) => list.filter((item) => !other.includes(item));

function present(event) {
  const scheduledDepartmentIds = new Set(event.schedules.map((schedule) => schedule.department.id));
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    location: event.location,
    startsAt: event.startsAt,
    published: event.published,
    createdBy: event.createdBy,
    departments: event.departments.map(({ id, name }) => ({ id, name, scheduled: scheduledDepartmentIds.has(id) })),
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

export function createAgendaService({ repository = agendaRepository, notifier = defaultNotifier } = {}) {
  async function findEvent(id) {
    const event = await repository.findById(id);
    if (!event) throw AppError.notFound("Evento não encontrado na agenda");
    return event;
  }

  async function assertDepartmentsExist(departmentIds) {
    if (departmentIds.length === 0) return;
    if ((await repository.countExistingDepartments(departmentIds)) !== departmentIds.length) {
      throw AppError.notFound("Um ou mais ministérios não existem");
    }
  }

  async function warnAssignees(schedules, buildMessage, except) {
    for (const schedule of schedules) {
      if (!schedule.published || schedule.assigneeIds.length === 0) continue;
      await notifier.to(schedule.assigneeIds, buildMessage(schedule), { except });
    }
  }

  function planDepartments(auth, current, departmentIds) {
    if (!departmentIds) return { added: [], removed: [] };
    const currentIds = current.departments.map((department) => department.id);
    const added = difference(departmentIds, currentIds);
    const removed = difference(currentIds, departmentIds);
    assertCanIndicateDepartments(auth, [...added, ...removed]);
    return { added, removed };
  }

  function planReschedule(current, startsAt, keptSchedules) {
    const moved = startsAt !== undefined && startsAt.getTime() !== current.startsAt.getTime();
    if (!moved) return { moved, moveIds: [], dropIds: [], unsyncDepartmentIds: [] };
    if (isInsideWindow(startsAt)) {
      return { moved, moveIds: keptSchedules.map((schedule) => schedule.id), dropIds: [], unsyncDepartmentIds: [] };
    }
    return {
      moved,
      moveIds: [],
      dropIds: keptSchedules.map((schedule) => schedule.id),
      unsyncDepartmentIds: keptSchedules.map((schedule) => schedule.department.id),
    };
  }

  return {
    window(auth) {
      const window = agendaWindow();
      return {
        cycleYear: window.cycleYear,
        cycles: window.cycles,
        lastEditableDay: window.lastEditableDay,
        nextReleaseOn: window.nextReleaseOn,
        canEdit: canEditAgenda(auth),
      };
    },

    async publicAgenda() {
      const window = agendaWindow();
      const events = await repository.listPublished({ from: window.visibleFrom, until: window.editableUntil });
      return {
        cycleYear: window.cycleYear,
        cycles: window.cycles,
        lastEditableDay: window.lastEditableDay,
        events,
      };
    },

    async list(auth, { year } = {}) {
      const window = agendaWindow();
      const range = year
        ? agendaCycleRange(year)
        : { from: window.visibleFrom, until: window.editableUntil };
      return (await repository.list({ ...range, publishedOnly: !canEditAgenda(auth) })).map(present);
    },

    async getById(auth, id) {
      const event = await findEvent(id);
      if (!event.published && !canEditAgenda(auth)) throw AppError.notFound("Evento não encontrado na agenda");
      return present(event);
    },

    async create(auth, { departmentIds, ...data }) {
      assertCanEditAgenda(auth);
      assertInsideAgendaWindow(data.startsAt);
      assertCanIndicateDepartments(auth, departmentIds);
      await assertDepartmentsExist(departmentIds);

      const id = await repository.create({ ...data, departmentIds, createdById: auth.id });
      await scheduleAgendaEvents({ repository });
      return present(await findEvent(id));
    },

    async update(auth, id, { departmentIds, ...data }) {
      assertCanEditAgenda(auth);
      const current = await findEvent(id);
      assertUpcoming(current);
      if (current.published && data.published === false) {
        throw AppError.conflict("Um evento publicado não volta para rascunho: cancele-o se ele não for mais acontecer");
      }
      if (data.startsAt) assertInsideAgendaWindow(data.startsAt);

      const { added, removed } = planDepartments(auth, current, departmentIds);
      await assertDepartmentsExist(added);

      const removedSchedules = current.schedules.filter((schedule) => removed.includes(schedule.department.id));
      const keptSchedules = difference(current.schedules, removedSchedules);
      const reschedule = planReschedule(current, data.startsAt, keptSchedules);

      await repository.update(id, {
        data,
        addDepartmentIds: added,
        removeDepartmentIds: removed,
        moveSchedules: { ids: reschedule.moveIds, scheduleAt: data.startsAt },
        dropScheduleIds: [...removedSchedules.map((schedule) => schedule.id), ...reschedule.dropIds],
        unsyncDepartmentIds: reschedule.unsyncDepartmentIds,
      });

      await warnAssignees(removedSchedules, messages.scheduleCancelled, auth.id);
      if (reschedule.moved) {
        await warnAssignees(keptSchedules, (schedule) => messages.agendaEventMoved(schedule, data.startsAt), auth.id);
      }
      await scheduleAgendaEvents({ repository });
      return present(await findEvent(id));
    },

    async delete(auth, id) {
      assertCanEditAgenda(auth);
      const current = await findEvent(id);
      assertUpcoming(current);
      await repository.delete(
        id,
        current.schedules.map((schedule) => schedule.id),
      );
      await warnAssignees(current.schedules, messages.agendaEventCancelled, auth.id);
    },
  };
}

export const agendaService = createAgendaService();
