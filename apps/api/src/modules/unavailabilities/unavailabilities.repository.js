import { prisma } from "../../config/database.js";

const unavailabilitySelect = { id: true, startAt: true, endAt: true, reason: true };

const overlapping = (from, to) => ({ endAt: { gt: from }, ...(to && { startAt: { lt: to } }) });

export const unavailabilitiesRepository = {
  listByCredential(credentialId, { from, to }) {
    return prisma.unavailability.findMany({
      where: { credentialId, ...overlapping(from, to) },
      select: unavailabilitySelect,
      orderBy: { startAt: "asc" },
    });
  },

  listByDepartment(departmentId, { from, to }) {
    return prisma.unavailability.findMany({
      where: {
        ...overlapping(from, to),
        credential: {
          status: { not: "INACTIVE" },
          role: { not: "DEVELOPER" },
          departments: { some: { departmentId, pending: false } },
        },
      },
      select: { ...unavailabilitySelect, credential: { select: { id: true, name: true, username: true } } },
      orderBy: { startAt: "asc" },
    });
  },

  findOwned(id, credentialId) {
    return prisma.unavailability.findFirst({ where: { id, credentialId }, select: unavailabilitySelect });
  },

  create(credentialId, data) {
    return prisma.unavailability.create({ data: { credentialId, ...data }, select: unavailabilitySelect });
  },

  update(id, data) {
    return prisma.unavailability.update({ where: { id }, data, select: unavailabilitySelect });
  },

  async delete(id) {
    await prisma.unavailability.delete({ where: { id } });
  },

  findAssignmentsDuring(credentialId, { startAt, endAt }) {
    return prisma.credentialSchedule.findMany({
      where: { credentialId, schedule: { scheduleAt: { gte: startAt, lt: endAt } } },
      select: {
        id: true,
        schedule: {
          select: { id: true, name: true, scheduleAt: true, department: { select: { id: true, name: true } } },
        },
      },
      orderBy: { schedule: { scheduleAt: "asc" } },
    });
  },
};
