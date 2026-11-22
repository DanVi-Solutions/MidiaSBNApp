import { prisma } from "../../config/database.js";

const personSelect = { select: { id: true, name: true, username: true } };

const assignmentSelect = {
  id: true,
  changeStatus: true,
  credential: personSelect,
  credentialChange: { select: { id: true, name: true } },
};

const scheduleSummarySelect = {
  id: true,
  name: true,
  description: true,
  scheduleAt: true,
  published: true,
  recurringEventId: true,
  department: { select: { id: true, name: true } },
  _count: { select: { credentials: true } },
};

const scheduleDetailSelect = {
  ...scheduleSummarySelect,
  credentials: { select: assignmentSelect, orderBy: { credential: { name: "asc" } } },
};

function toSchedule(row) {
  if (!row) return null;
  const { _count, credentials, ...schedule } = row;
  return {
    ...schedule,
    assignedCount: _count.credentials,
    ...(credentials && { assignments: credentials }),
  };
}

function visibilityFilter({ manageableDepartmentIds, memberDepartmentIds }) {
  if (!manageableDepartmentIds) return {};
  return {
    OR: [
      { departmentId: { in: manageableDepartmentIds } },
      { departmentId: { in: memberDepartmentIds }, published: true },
    ],
  };
}

const activeMembershipIn = (departmentId) => ({ departments: { some: { departmentId, pending: false } } });

export const schedulesRepository = {
  async list({ visibility, departmentId, from, to }) {
    const rows = await prisma.schedule.findMany({
      where: {
        ...visibilityFilter(visibility),
        ...(departmentId && { departmentId }),
        scheduleAt: { gte: from, ...(to && { lt: to }) },
      },
      select: scheduleSummarySelect,
      orderBy: [{ scheduleAt: "asc" }, { department: { name: "asc" } }],
    });
    return rows.map(toSchedule);
  },

  async findById(id) {
    return toSchedule(await prisma.schedule.findUnique({ where: { id }, select: scheduleDetailSelect }));
  },

  async create(data) {
    return toSchedule(await prisma.schedule.create({ data, select: scheduleDetailSelect }));
  },

  async update(id, data) {
    return toSchedule(await prisma.schedule.update({ where: { id }, data, select: scheduleDetailSelect }));
  },

  async delete(id) {
    await prisma.schedule.delete({ where: { id } });
  },

  async deleteBefore(date) {
    const { count } = await prisma.schedule.deleteMany({ where: { scheduleAt: { lt: date } } });
    return count;
  },

  listAssignmentsOf(credentialId, { from }) {
    return prisma.credentialSchedule.findMany({
      where: { credentialId, schedule: { published: true, scheduleAt: { gte: from } } },
      select: {
        id: true,
        changeStatus: true,
        credentialChange: { select: { id: true, name: true } },
        schedule: {
          select: { id: true, name: true, description: true, scheduleAt: true, department: { select: { id: true, name: true } } },
        },
      },
      orderBy: { schedule: { scheduleAt: "asc" } },
    });
  },

  findMember(departmentId, credentialId) {
    return prisma.credential.findFirst({
      where: { id: credentialId, ...activeMembershipIn(departmentId) },
      select: { id: true, status: true },
    });
  },

  async addAssignment(scheduleId, credentialId) {
    await prisma.credentialSchedule.create({ data: { scheduleId, credentialId } });
  },

  async removeAssignment(scheduleId, credentialId) {
    const { count } = await prisma.credentialSchedule.deleteMany({ where: { scheduleId, credentialId } });
    return count === 1;
  },

  membersWithAvailabilityAt(departmentId, { at, weekday }) {
    return prisma.credential.findMany({
      where: { status: { not: "INACTIVE" }, ...activeMembershipIn(departmentId) },
      select: {
        id: true,
        name: true,
        username: true,
        availabilities: { where: { weekday }, select: { morning: true, afternoon: true, night: true } },
        unavailabilities: { where: { startAt: { lte: at }, endAt: { gt: at } }, select: { id: true } },
      },
      orderBy: { name: "asc" },
    });
  },
};
