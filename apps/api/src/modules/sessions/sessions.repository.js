import { prisma } from "../../config/database.js";

const notExpired = () => ({ expiresAt: { gt: new Date() } });

export const sessionsRepository = {
  async isOpen(sessionId, credentialId) {
    const count = await prisma.refreshToken.count({ where: { id: sessionId, credentialId, ...notExpired() } });
    return count === 1;
  },

  listOpen(credentialId) {
    return prisma.refreshToken.findMany({
      where: { credentialId, ...notExpired() },
      select: { id: true, userAgent: true, startedAt: true, expiresAt: true },
      orderBy: { startedAt: "desc" },
    });
  },

  async end(sessionId, credentialId) {
    const { count } = await prisma.refreshToken.deleteMany({ where: { id: sessionId, credentialId } });
    return count === 1;
  },

  async endAll(credentialId, { except } = {}) {
    const { count } = await prisma.refreshToken.deleteMany({
      where: { credentialId, ...(except && { id: { not: except } }) },
    });
    return count;
  },

  async deleteExpired(now = new Date()) {
    const { count } = await prisma.refreshToken.deleteMany({ where: { expiresAt: { lte: now } } });
    return count;
  },
};
