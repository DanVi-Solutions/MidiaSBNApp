import { prisma } from "../../config/database.js";

const requestSelect = {
  id: true,
  changeStatus: true,
  credentialId: true,
  credentialChangeId: true,
  credential: { select: { id: true, name: true, username: true } },
  credentialChange: { select: { id: true, name: true, username: true } },
  schedule: {
    select: {
      id: true,
      name: true,
      scheduleAt: true,
      published: true,
      department: { select: { id: true, name: true } },
    },
  },
};

const upcoming = () => ({ schedule: { scheduleAt: { gt: new Date() } } });

export const changeRequestsRepository = {
  findAssignment(id) {
    return prisma.credentialSchedule.findUnique({ where: { id }, select: requestSelect });
  },

  listReceived(credentialId) {
    return prisma.credentialSchedule.findMany({
      where: { credentialChangeId: credentialId, changeStatus: "REQUESTED", ...upcoming() },
      select: requestSelect,
      orderBy: { schedule: { scheduleAt: "asc" } },
    });
  },

  listSent(credentialId) {
    return prisma.credentialSchedule.findMany({
      where: { credentialId, changeStatus: { in: ["REQUESTED", "REJECTED"] }, ...upcoming() },
      select: requestSelect,
      orderBy: { schedule: { scheduleAt: "asc" } },
    });
  },

  findActiveMember(departmentId, credentialId) {
    return prisma.credential.findFirst({
      where: { id: credentialId, status: "ACTIVE", departments: { some: { departmentId, pending: false } } },
      select: { id: true },
    });
  },

  async isAssigned(scheduleId, credentialId) {
    return (await prisma.credentialSchedule.count({ where: { scheduleId, credentialId } })) > 0;
  },

  request(id, substituteId) {
    return prisma.credentialSchedule.update({
      where: { id },
      data: { changeStatus: "REQUESTED", credentialChangeId: substituteId, confirmedAt: null },
      select: requestSelect,
    });
  },

  cancel(id) {
    return prisma.credentialSchedule.update({
      where: { id },
      data: { changeStatus: "NONE", credentialChangeId: null },
      select: requestSelect,
    });
  },

  reject(id) {
    return prisma.credentialSchedule.update({ where: { id }, data: { changeStatus: "REJECTED" }, select: requestSelect });
  },

  async accept(id, substituteId) {
    const { count } = await prisma.credentialSchedule.updateMany({
      where: { id, changeStatus: "REQUESTED", credentialChangeId: substituteId },
      data: {
        credentialId: substituteId,
        changeStatus: "NONE",
        credentialChangeId: null,
        reminderSentAt: null,
        confirmedAt: new Date(),
        checkedInAt: null,
      },
    });
    return count === 1;
  },
};
