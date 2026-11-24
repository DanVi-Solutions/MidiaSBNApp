import { prisma } from "../../config/database.js";

const personSelect = { select: { id: true, name: true, username: true, role: true } };

const assignmentSelect = {
  id: true,
  changeStatus: true,
  confirmedAt: true,
  checkedInAt: true,
  credential: personSelect,
  credentialChange: { select: { id: true, name: true } },
};

const ownAssignmentSelect = {
  id: true,
  changeStatus: true,
  credential: { select: { id: true, name: true } },
  confirmedAt: true,
  checkedInAt: true,
  credentialChange: { select: { id: true, name: true } },
  schedule: {
    select: { id: true, name: true, description: true, scheduleAt: true, department: { select: { id: true, name: true } } },
  },
};

const scheduleSummarySelect = {
  id: true,
  name: true,
  description: true,
  scheduleAt: true,
  published: true,
  selfSignup: true,
  volunteersNeeded: true,
  recurringEventId: true,
  agendaEventId: true,
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

const availabilityAtSelect = (at, weekday) => ({
  id: true,
  name: true,
  username: true,
  role: true,
  worshipService: true,
  availabilities: { where: { weekday }, select: { morning: true, afternoon: true, night: true } },
  unavailabilities: { where: { startAt: { lte: at }, endAt: { gt: at } }, select: { id: true } },
});

const SCHEDULABLE_STATUSES = ["ACTIVE", "RECOVERING"];

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

  async findManyByIds(ids) {
    const rows = await prisma.schedule.findMany({ where: { id: { in: ids } }, select: scheduleDetailSelect });
    return rows.map(toSchedule);
  },

  async listOpenForSignup({ departmentIds, credentialId, from }) {
    const rows = await prisma.schedule.findMany({
      where: { departmentId: { in: departmentIds }, published: true, selfSignup: true, scheduleAt: { gt: from } },
      select: { ...scheduleSummarySelect, credentials: { where: { credentialId }, select: { id: true } } },
      orderBy: { scheduleAt: "asc" },
    });
    return rows.map(({ _count, credentials, ...schedule }) => ({
      ...schedule,
      assignedCount: _count.credentials,
      signedUp: credentials.length > 0,
    }));
  },

  async signUp(scheduleId, credentialId) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "schedule" WHERE id = ${scheduleId}::uuid FOR UPDATE`;
      const schedule = await tx.schedule.findUnique({
        where: { id: scheduleId },
        select: { volunteersNeeded: true, _count: { select: { credentials: true } } },
      });
      if (schedule._count.credentials >= schedule.volunteersNeeded) return false;
      await tx.credentialSchedule.create({ data: { scheduleId, credentialId, confirmedAt: new Date() } });
      return true;
    });
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

  async resetAfterReschedule(scheduleId) {
    await prisma.$transaction([
      prisma.credentialSchedule.updateMany({
        where: { scheduleId },
        data: { reminderSentAt: null, confirmedAt: null, checkedInAt: null },
      }),
      prisma.schedule.update({ where: { id: scheduleId }, data: { attendanceNoticeSentAt: null } }),
    ]);
  },

  async markDeclined(id) {
    const { count } = await prisma.credentialSchedule.updateMany({
      where: { id, changeStatus: { in: ["NONE", "REJECTED"] }, checkedInAt: null },
      data: { changeStatus: "DECLINED", credentialChangeId: null, confirmedAt: null },
    });
    return count === 1;
  },

  replaceAssignment(id, substituteId) {
    return prisma.credentialSchedule.update({
      where: { id },
      data: {
        credentialId: substituteId,
        changeStatus: "NONE",
        credentialChangeId: null,
        confirmedAt: null,
        checkedInAt: null,
        reminderSentAt: null,
      },
    });
  },

  countDeclined(scheduleId) {
    return prisma.credentialSchedule.count({ where: { scheduleId, changeStatus: "DECLINED" } });
  },

  async deleteBefore(date) {
    const { count } = await prisma.schedule.deleteMany({ where: { scheduleAt: { lt: date } } });
    return count;
  },

  listAssignmentsOf(credentialId, { from }) {
    return prisma.credentialSchedule.findMany({
      where: { credentialId, schedule: { published: true, scheduleAt: { gte: from } } },
      select: ownAssignmentSelect,
      orderBy: { schedule: { scheduleAt: "asc" } },
    });
  },

  findOwnAssignment(id, credentialId) {
    return prisma.credentialSchedule.findFirst({
      where: { id, credentialId, schedule: { published: true } },
      select: ownAssignmentSelect,
    });
  },

  async confirmPresence(id) {
    const { count } = await prisma.credentialSchedule.updateMany({
      where: { id, changeStatus: { not: "REQUESTED" } },
      data: { confirmedAt: new Date(), changeStatus: "NONE", credentialChangeId: null },
    });
    return count === 1;
  },

  async checkIn(id) {
    const { count } = await prisma.credentialSchedule.updateMany({
      where: { id, checkedInAt: null, confirmedAt: { not: null } },
      data: { checkedInAt: new Date() },
    });
    return count === 1;
  },

  findMember(departmentId, credentialId) {
    return prisma.credential.findFirst({
      where: { id: credentialId, ...activeMembershipIn(departmentId) },
      select: { id: true, status: true, role: true },
    });
  },

  async addAssignment(scheduleId, credentialId) {
    await prisma.credentialSchedule.create({ data: { scheduleId, credentialId } });
  },

  async removeAssignment(scheduleId, credentialId) {
    const { count } = await prisma.credentialSchedule.deleteMany({ where: { scheduleId, credentialId } });
    return count === 1;
  },

  schedulableMembersAt(departmentId, { at, weekday, excludeRoles = [] }) {
    return prisma.credential.findMany({
      where: {
        status: { in: SCHEDULABLE_STATUSES },
        ...(excludeRoles.length > 0 && { role: { notIn: excludeRoles } }),
        ...activeMembershipIn(departmentId),
      },
      select: availabilityAtSelect(at, weekday),
    });
  },

  findAssignmentsOf(credentialIds, { from, to }) {
    return prisma.credentialSchedule.findMany({
      where: { credentialId: { in: credentialIds }, schedule: { scheduleAt: { gte: from, lt: to } } },
      select: { credentialId: true, schedule: { select: { scheduleAt: true } } },
    });
  },

  async countUpcomingAssignments(credentialIds, from) {
    const groups = await prisma.credentialSchedule.groupBy({
      by: ["credentialId"],
      where: { credentialId: { in: credentialIds }, schedule: { scheduleAt: { gte: from } } },
      _count: { _all: true },
    });
    return new Map(groups.map((group) => [group.credentialId, group._count._all]));
  },

  async addAssignments(assignments) {
    const { count } = await prisma.credentialSchedule.createMany({ data: assignments, skipDuplicates: true });
    return count;
  },

  membersWithAvailabilityAt(departmentId, { at, weekday, excludeRoles = [] }) {
    return prisma.credential.findMany({
      where: {
        status: { not: "INACTIVE" },
        ...(excludeRoles.length > 0 && { role: { notIn: excludeRoles } }),
        ...activeMembershipIn(departmentId),
      },
      select: availabilityAtSelect(at, weekday),
      orderBy: { name: "asc" },
    });
  },
};
