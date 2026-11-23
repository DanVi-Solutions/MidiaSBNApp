import { prisma } from "../../config/database.js";

const deliverable = () => ({
  credential: { role: { not: "ADMINISTRATOR" }, status: { not: "INACTIVE" } },
  session: { expiresAt: { gt: new Date() } },
});

const subscriptionSelect = { id: true, credentialId: true, endpoint: true, p256dh: true, auth: true };

export const pushSubscriptionsRepository = {
  upsert({ credentialId, sessionId, endpoint, p256dh, auth }) {
    return prisma.pushSubscription.upsert({
      where: { endpoint },
      create: { credentialId, sessionId, endpoint, p256dh, auth },
      update: { credentialId, sessionId, p256dh, auth },
      select: { id: true, createdAt: true },
    });
  },

  async deleteOwned(endpoint, credentialId) {
    const { count } = await prisma.pushSubscription.deleteMany({ where: { endpoint, credentialId } });
    return count === 1;
  },

  findDeliverable(credentialIds) {
    return prisma.pushSubscription.findMany({
      where: { credentialId: { in: credentialIds }, ...deliverable() },
      select: subscriptionSelect,
    });
  },

  findOfSession(sessionId) {
    return prisma.pushSubscription.findMany({
      where: { sessionId, ...deliverable() },
      select: subscriptionSelect,
    });
  },

  async isRegistered(endpoint, credentialId) {
    return (await prisma.pushSubscription.count({ where: { endpoint, credentialId } })) === 1;
  },

  async deleteMany(ids) {
    if (ids.length === 0) return;
    await prisma.pushSubscription.deleteMany({ where: { id: { in: ids } } });
  },

  async deleteOfExpiredSessions(now) {
    const { count } = await prisma.pushSubscription.deleteMany({ where: { session: { expiresAt: { lte: now } } } });
    return count;
  },
};
