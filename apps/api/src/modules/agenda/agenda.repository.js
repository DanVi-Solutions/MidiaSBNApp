import { prisma } from "../../config/database.js";

const eventSelect = {
  id: true,
  name: true,
  description: true,
  location: true,
  startsAt: true,
  times: true,
  published: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  departments: {
    select: { syncedSlots: true, department: { select: { id: true, name: true } } },
    orderBy: { department: { name: "asc" } },
  },
  schedules: {
    select: {
      id: true,
      name: true,
      scheduleAt: true,
      agendaSlot: true,
      published: true,
      department: { select: { id: true, name: true } },
      credentials: { select: { credentialId: true } },
    },
  },
};

function toAgendaEvent(row) {
  if (!row) return null;
  const { departments, schedules, ...event } = row;
  return {
    ...event,
    departments: departments.map(({ department, syncedSlots }) => ({ ...department, syncedSlots })),
    schedules: schedules.map(({ credentials, ...schedule }) => ({
      ...schedule,
      assigneeIds: credentials.map((assignment) => assignment.credentialId),
    })),
  };
}

export const agendaRepository = {
  async list({ from, until, publishedOnly }) {
    const rows = await prisma.agendaEvent.findMany({
      where: { startsAt: { gte: from, lt: until }, ...(publishedOnly && { published: true }) },
      select: eventSelect,
      orderBy: [{ startsAt: "asc" }, { name: "asc" }],
    });
    return rows.map(toAgendaEvent);
  },

  listPublished({ from, until }) {
    return prisma.agendaEvent.findMany({
      where: { published: true, startsAt: { gte: from, lt: until } },
      select: { id: true, name: true, description: true, location: true, startsAt: true, times: true },
      orderBy: [{ startsAt: "asc" }, { name: "asc" }],
    });
  },

  async findById(id) {
    return toAgendaEvent(await prisma.agendaEvent.findUnique({ where: { id }, select: eventSelect }));
  },

  async create({ departmentIds, ...data }) {
    const row = await prisma.agendaEvent.create({
      data: { ...data, departments: { create: departmentIds.map((departmentId) => ({ departmentId })) } },
      select: { id: true },
    });
    return row.id;
  },

  async update(id, { data, addDepartmentIds, removeDepartmentIds, dropScheduleIds, moves, syncedSlotsByDepartment }) {
    await prisma.$transaction(async (tx) => {
      if (dropScheduleIds.length > 0) {
        await tx.schedule.deleteMany({ where: { id: { in: dropScheduleIds } } });
      }
      for (const move of moves) {
        await tx.credentialSchedule.deleteMany({ where: { scheduleId: move.id } });
        await tx.notification.deleteMany({ where: { scheduleId: move.id } });
        await tx.schedule.update({
          where: { id: move.id },
          data: { scheduleAt: move.scheduleAt, published: false, attendanceNoticeSentAt: null },
        });
      }
      if (removeDepartmentIds.length > 0) {
        await tx.agendaEventDepartment.deleteMany({
          where: { agendaEventId: id, departmentId: { in: removeDepartmentIds } },
        });
      }
      for (const [departmentId, syncedSlots] of Object.entries(syncedSlotsByDepartment)) {
        await tx.agendaEventDepartment.update({
          where: { agendaEventId_departmentId: { agendaEventId: id, departmentId } },
          data: { syncedSlots },
        });
      }
      if (addDepartmentIds.length > 0) {
        await tx.agendaEventDepartment.createMany({
          data: addDepartmentIds.map((departmentId) => ({ agendaEventId: id, departmentId })),
          skipDuplicates: true,
        });
      }
      await tx.agendaEvent.update({ where: { id }, data });
    });
  },

  async delete(id, scheduleIds) {
    await prisma.$transaction([
      prisma.schedule.deleteMany({ where: { id: { in: scheduleIds } } }),
      prisma.agendaEvent.delete({ where: { id } }),
    ]);
  },

  async countExistingDepartments(ids) {
    return prisma.department.count({ where: { id: { in: ids } } });
  },

  listSchedulingCandidates({ from, until }) {
    return prisma.agendaEventDepartment.findMany({
      where: { agendaEvent: { published: true, startsAt: { gte: from, lt: until } } },
      select: {
        departmentId: true,
        syncedSlots: true,
        agendaEvent: { select: { id: true, name: true, description: true, startsAt: true, times: true } },
      },
    });
  },

  async createSchedules(schedules, syncedSlotUpdates) {
    if (schedules.length === 0) return 0;
    return prisma.$transaction(async (tx) => {
      const { count } = await tx.schedule.createMany({ data: schedules, skipDuplicates: true });
      for (const { agendaEventId, departmentId, syncedSlots } of syncedSlotUpdates) {
        await tx.agendaEventDepartment.update({
          where: { agendaEventId_departmentId: { agendaEventId, departmentId } },
          data: { syncedSlots },
        });
      }
      return count;
    });
  },

  async deleteBefore(date) {
    const { count } = await prisma.agendaEvent.deleteMany({ where: { startsAt: { lt: date } } });
    return count;
  },
};
