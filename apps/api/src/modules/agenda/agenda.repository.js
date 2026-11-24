import { prisma } from "../../config/database.js";

const eventSelect = {
  id: true,
  name: true,
  description: true,
  location: true,
  startsAt: true,
  published: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { id: true, name: true } },
  departments: {
    select: { syncedAt: true, department: { select: { id: true, name: true } } },
    orderBy: { department: { name: "asc" } },
  },
  schedules: {
    select: {
      id: true,
      name: true,
      scheduleAt: true,
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
    departments: departments.map(({ department, syncedAt }) => ({ ...department, syncedAt })),
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
      select: { id: true, name: true, description: true, location: true, startsAt: true },
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

  async update(id, { data, addDepartmentIds, removeDepartmentIds, moveSchedules, dropScheduleIds, unsyncDepartmentIds }) {
    await prisma.$transaction(async (tx) => {
      if (dropScheduleIds.length > 0) {
        await tx.schedule.deleteMany({ where: { id: { in: dropScheduleIds } } });
      }
      if (moveSchedules.ids.length > 0) {
        await tx.credentialSchedule.deleteMany({ where: { scheduleId: { in: moveSchedules.ids } } });
        await tx.notification.deleteMany({ where: { scheduleId: { in: moveSchedules.ids } } });
        await tx.schedule.updateMany({
          where: { id: { in: moveSchedules.ids } },
          data: { scheduleAt: moveSchedules.scheduleAt, published: false, attendanceNoticeSentAt: null },
        });
      }
      if (removeDepartmentIds.length > 0) {
        await tx.agendaEventDepartment.deleteMany({
          where: { agendaEventId: id, departmentId: { in: removeDepartmentIds } },
        });
      }
      if (unsyncDepartmentIds.length > 0) {
        await tx.agendaEventDepartment.updateMany({
          where: { agendaEventId: id, departmentId: { in: unsyncDepartmentIds } },
          data: { syncedAt: null },
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

  listUnscheduled({ from, until }) {
    return prisma.agendaEventDepartment.findMany({
      where: { syncedAt: null, agendaEvent: { published: true, startsAt: { gte: from, lt: until } } },
      select: {
        departmentId: true,
        agendaEvent: { select: { id: true, name: true, description: true, startsAt: true } },
      },
    });
  },

  async createSchedules(entries, syncedAt) {
    if (entries.length === 0) return 0;
    const [{ count }] = await prisma.$transaction([
      prisma.schedule.createMany({
        data: entries.map(({ agendaEvent, departmentId }) => ({
          name: agendaEvent.name,
          description: agendaEvent.description,
          scheduleAt: agendaEvent.startsAt,
          departmentId,
          agendaEventId: agendaEvent.id,
        })),
        skipDuplicates: true,
      }),
      prisma.agendaEventDepartment.updateMany({
        where: { OR: entries.map(({ agendaEvent, departmentId }) => ({ agendaEventId: agendaEvent.id, departmentId })) },
        data: { syncedAt },
      }),
    ]);
    return count;
  },

  async deleteBefore(date) {
    const { count } = await prisma.agendaEvent.deleteMany({ where: { startsAt: { lt: date } } });
    return count;
  },
};
