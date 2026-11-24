import { AppError } from "../../shared/errors/AppError.js";
import { scheduleAtForSlot, slotInstant } from "../../shared/time/agendaSlots.js";
import { agendaCycleRange, agendaWindow, assertInsideAgendaWindow } from "../../shared/time/agendaWindow.js";
import { isInsideWindow } from "../../shared/time/scheduleWindow.js";
import { localDateOf } from "../../shared/time/zonedTime.js";
import { messages } from "../notifications/notifications.messages.js";
import { notifier as defaultNotifier } from "../notifications/notifications.notifier.js";
import { scheduleAgendaEvents } from "./agenda.jobs.js";
import { assertCanEditAgenda, assertCanIndicateDepartments, assertUpcoming, canEditAgenda } from "./agenda.policy.js";
import { agendaRepository } from "./agenda.repository.js";

const difference = (list, other) => list.filter((item) => !other.includes(item));
const sameList = (a, b) => a.length === b.length && a.every((item, index) => item === b[index]);
const eventDateOf = (event) => localDateOf(event.startsAt);
const lastSlotOf = (event) => slotInstant(eventDateOf(event), event.times.at(-1));

function present(event) {
  const scheduledDepartmentIds = new Set(event.schedules.map((schedule) => schedule.department.id));
  return {
    id: event.id,
    name: event.name,
    description: event.description,
    location: event.location,
    date: eventDateOf(event),
    times: event.times,
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

  function assertSlotsInsideWindow(date, times) {
    for (const time of times) assertInsideAgendaWindow(slotInstant(date, time));
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

  function planReschedule(keptSchedules, nextDate) {
    const moves = [];
    const dropped = [];
    for (const schedule of keptSchedules) {
      const scheduleAt = scheduleAtForSlot(nextDate, schedule.agendaSlot);
      if (isInsideWindow(scheduleAt)) moves.push({ id: schedule.id, scheduleAt });
      else dropped.push(schedule);
    }
    return { moves, dropped };
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
      const range = year ? agendaCycleRange(year) : { from: window.visibleFrom, until: window.editableUntil };
      return (await repository.list({ ...range, publishedOnly: !canEditAgenda(auth) })).map(present);
    },

    async getById(auth, id) {
      const event = await findEvent(id);
      if (!event.published && !canEditAgenda(auth)) throw AppError.notFound("Evento não encontrado na agenda");
      return present(event);
    },

    async create(auth, { departmentIds, date, times, ...data }) {
      assertCanEditAgenda(auth);
      assertSlotsInsideWindow(date, times);
      assertCanIndicateDepartments(auth, departmentIds);
      await assertDepartmentsExist(departmentIds);

      const id = await repository.create({
        ...data,
        startsAt: slotInstant(date, times[0]),
        times,
        departmentIds,
        createdById: auth.id,
      });
      await scheduleAgendaEvents({ repository });
      return present(await findEvent(id));
    },

    async update(auth, id, { departmentIds, date, times, ...data }) {
      assertCanEditAgenda(auth);
      const current = await findEvent(id);
      assertUpcoming(lastSlotOf(current));
      if (current.published && data.published === false) {
        throw AppError.conflict("Um evento publicado não volta para rascunho: cancele-o se ele não for mais acontecer");
      }

      const currentDate = eventDateOf(current);
      const nextDate = date ?? currentDate;
      const nextTimes = times ?? current.times;
      const dateChanged = nextDate !== currentDate;
      const timesChanged = !sameList(nextTimes, current.times);
      assertSlotsInsideWindow(nextDate, dateChanged ? nextTimes : difference(nextTimes, current.times));

      const { added, removed } = planDepartments(auth, current, departmentIds);
      await assertDepartmentsExist(added);

      const removedSlots = difference(current.times, nextTimes);
      const cancelledSchedules = current.schedules.filter(
        (schedule) => removed.includes(schedule.department.id) || removedSlots.includes(schedule.agendaSlot),
      );
      const keptSchedules = difference(current.schedules, cancelledSchedules);
      const { moves, dropped } = dateChanged ? planReschedule(keptSchedules, nextDate) : { moves: [], dropped: [] };

      const syncedSlotsByDepartment = {};
      for (const department of current.departments) {
        if (removed.includes(department.id)) continue;
        const droppedSlots = dropped
          .filter((schedule) => schedule.department.id === department.id)
          .map((schedule) => schedule.agendaSlot);
        const nextSynced = department.syncedSlots.filter(
          (slot) => nextTimes.includes(slot) && !droppedSlots.includes(slot),
        );
        if (!sameList(nextSynced, department.syncedSlots)) syncedSlotsByDepartment[department.id] = nextSynced;
      }

      await repository.update(id, {
        data: {
          ...data,
          ...((dateChanged || timesChanged) && { startsAt: slotInstant(nextDate, nextTimes[0]), times: nextTimes }),
        },
        addDepartmentIds: added,
        removeDepartmentIds: removed,
        dropScheduleIds: [...cancelledSchedules, ...dropped].map((schedule) => schedule.id),
        moves,
        syncedSlotsByDepartment,
      });

      await warnAssignees(cancelledSchedules, messages.scheduleCancelled, auth.id);
      if (dateChanged) {
        await warnAssignees(
          keptSchedules,
          (schedule) => messages.agendaEventMoved(schedule, slotInstant(nextDate, schedule.agendaSlot)),
          auth.id,
        );
      }
      await scheduleAgendaEvents({ repository });
      return present(await findEvent(id));
    },

    async delete(auth, id) {
      assertCanEditAgenda(auth);
      const current = await findEvent(id);
      assertUpcoming(lastSlotOf(current));
      await repository.delete(
        id,
        current.schedules.map((schedule) => schedule.id),
      );
      await warnAssignees(current.schedules, messages.agendaEventCancelled, auth.id);
    },
  };
}

export const agendaService = createAgendaService();
