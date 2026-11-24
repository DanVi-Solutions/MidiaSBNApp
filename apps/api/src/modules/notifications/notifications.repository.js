import { prisma } from "../../config/database.js";

const notificationSelect = {
  id: true,
  type: true,
  title: true,
  body: true,
  link: true,
  scheduleId: true,
  readAt: true,
  createdAt: true,
};

const RECIPIENT_STATUSES = ["ACTIVE", "RECOVERING"];
const SCHEDULE_MANAGER_ROLES = [
  "SCHEDULER_MANAGER",
  "DEPARTMENT_MANAGER",
  "GENERAL_MANAGER",
];
const DEPARTMENT_LEADER_ROLES = ["DEPARTMENT_MANAGER", "GENERAL_MANAGER"];

const activeMemberOf = (departmentId) => ({
  status: { in: RECIPIENT_STATUSES },
  departments: { some: { departmentId, pending: false } },
});

const ids = async (query) => (await query).map((row) => row.id);

export const notificationsRepository = {
  createMany(rows) {
    return prisma.notification.createManyAndReturn({ data: rows, select: { ...notificationSelect, credentialId: true } });
  },

  list(credentialId, { cursor, limit }) {
    return prisma.notification.findMany({
      where: { credentialId },
      select: notificationSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
  },

  async belongsTo(id, credentialId) {
    return (await prisma.notification.count({ where: { id, credentialId } })) === 1;
  },

  countUnread(credentialId) {
    return prisma.notification.count({ where: { credentialId, readAt: null } });
  },

  async markRead(id, credentialId) {
    await prisma.notification.updateMany({ where: { id, credentialId, readAt: null }, data: { readAt: new Date() } });
    return prisma.notification.findFirst({ where: { id, credentialId }, select: notificationSelect });
  },

  async markAllRead(credentialId) {
    const { count } = await prisma.notification.updateMany({
      where: { credentialId, readAt: null },
      data: { readAt: new Date() },
    });
    return count;
  },

  async delete(id, credentialId) {
    const { count } = await prisma.notification.deleteMany({ where: { id, credentialId } });
    return count === 1;
  },

  async deleteAll(credentialId) {
    const { count } = await prisma.notification.deleteMany({ where: { credentialId } });
    return count;
  },

  async discardForEveryone(scheduleId, types) {
    await prisma.notification.deleteMany({ where: { scheduleId, type: { in: types } } });
  },

  async discardAboutSchedule(credentialId, scheduleId, types) {
    await prisma.notification.deleteMany({ where: { credentialId, scheduleId, type: { in: types } } });
  },

  async deleteStale({ readBefore, createdBefore, scheduleStartedBefore }) {
    const { count } = await prisma.notification.deleteMany({
      where: {
        OR: [
          { readAt: { lt: readBefore } },
          { createdAt: { lt: createdBefore } },
          { schedule: { scheduleAt: { lt: scheduleStartedBefore } } },
        ],
      },
    });
    return count;
  },

  scheduleManagersOf(departmentId) {
    return ids(
      prisma.credential.findMany({
        where: { ...activeMemberOf(departmentId), role: { in: SCHEDULE_MANAGER_ROLES } },
        select: { id: true },
      }),
    );
  },

  departmentLeadersOf(departmentId) {
    return ids(
      prisma.credential.findMany({
        where: { ...activeMemberOf(departmentId), role: { in: DEPARTMENT_LEADER_ROLES } },
        select: { id: true },
      }),
    );
  },

  findStartedWithoutAttendanceNotice({ from, until }) {
    return prisma.schedule.findMany({
      where: { published: true, attendanceNoticeSentAt: null, scheduleAt: { gt: from, lte: until } },
      select: {
        id: true,
        name: true,
        scheduleAt: true,
        department: { select: { id: true, name: true } },
        credentials: {
          where: { confirmedAt: null, changeStatus: { not: "DECLINED" } },
          select: { credential: { select: { name: true } } },
          orderBy: { credential: { name: "asc" } },
        },
      },
    });
  },

  async markAttendanceNoticeSent(scheduleIds, sentAt) {
    await prisma.schedule.updateMany({ where: { id: { in: scheduleIds } }, data: { attendanceNoticeSentAt: sentAt } });
  },

  transferReviewersOf(departmentId) {
    return ids(
      prisma.credential.findMany({
        where: {
          status: { in: RECIPIENT_STATUSES },
          OR: [
            { role: "ADMINISTRATOR" },
            { role: "GENERAL_MANAGER", departments: { some: { departmentId, pending: false } } },
          ],
        },
        select: { id: true },
      }),
    );
  },

  everyoneWhoBuildsSchedules() {
    return ids(
      prisma.credential.findMany({
        where: {
          status: { in: RECIPIENT_STATUSES },
          OR: [
            { role: "ADMINISTRATOR" },
            { role: { in: SCHEDULE_MANAGER_ROLES }, departments: { some: { pending: false } } },
          ],
        },
        select: { id: true },
      }),
    );
  },

  membersOf(departmentId) {
    return ids(
      prisma.credential.findMany({
        where: { ...activeMemberOf(departmentId), role: { notIn: ["DEVELOPER", "ADMINISTRATOR"] } },
        select: { id: true },
      }),
    );
  },

  findDueReminders({ from, until }) {
    return prisma.credentialSchedule.findMany({
      where: {
        reminderSentAt: null,
        changeStatus: { not: "DECLINED" },
        credential: { status: { in: RECIPIENT_STATUSES } },
        schedule: { published: true, scheduleAt: { gt: from, lte: until } },
      },
      select: {
        id: true,
        credentialId: true,
        confirmedAt: true,
        schedule: { select: { id: true, name: true, scheduleAt: true, department: { select: { id: true, name: true } } } },
      },
    });
  },

  async markRemindersSent(assignmentIds, sentAt) {
    await prisma.credentialSchedule.updateMany({ where: { id: { in: assignmentIds } }, data: { reminderSentAt: sentAt } });
  },
};
