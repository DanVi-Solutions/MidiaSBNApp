import { prisma } from "../../config/database.js";

const periodsSelect = { weekday: true, morning: true, afternoon: true, night: true };

export const availabilitiesRepository = {
  findByCredential(credentialId) {
    return prisma.availability.findMany({ where: { credentialId }, select: periodsSelect });
  },

  async replaceWeek(credentialId, days) {
    await prisma.$transaction([
      prisma.availability.deleteMany({ where: { credentialId } }),
      prisma.availability.createMany({ data: days.map((day) => ({ credentialId, ...day })) }),
    ]);
  },

  async findWorshipService(credentialId) {
    const credential = await prisma.credential.findUnique({ where: { id: credentialId }, select: { worshipService: true } });
    return credential?.worshipService ?? null;
  },

  async setWorshipService(credentialId, worshipService) {
    const credential = await prisma.credential.update({
      where: { id: credentialId },
      data: { worshipService },
      select: { worshipService: true },
    });
    return credential.worshipService;
  },

  listMembersOf(departmentId) {
    return prisma.credential.findMany({
      where: {
        status: { not: "INACTIVE" },
        departments: { some: { departmentId, pending: false } },
      },
      select: { id: true, name: true, username: true, availabilities: { select: periodsSelect } },
      orderBy: { name: "asc" },
    });
  },
};
