import { prisma } from "../../config/database.js";
import { sessionCredentialSelect } from "../../shared/auth/session.js";

const deleteExpiredRefreshTokens = (credentialId) =>
  prisma.refreshToken.deleteMany({ where: { credentialId, expiresAt: { lt: new Date() } } });

export const authRepository = {
  findCredentialByNumber(credentialNumber, credentialNumberHash) {
    return prisma.credential.findFirst({
      where: { OR: [{ credentialNumber }, { credentialNumberHash }] },
      select: sessionCredentialSelect,
    });
  },

  async openSession(credentialId, { tokenHash, expiresAt, userAgent }) {
    const [, session] = await prisma.$transaction([
      deleteExpiredRefreshTokens(credentialId),
      prisma.refreshToken.create({
        data: { credentialId, tokenHash, expiresAt, userAgent },
        select: { id: true },
      }),
    ]);
    return session.id;
  },

  findRefreshToken(tokenHash) {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { credential: { select: sessionCredentialSelect } },
    });
  },

  async rotateRefreshToken(sessionId, currentTokenHash, { tokenHash, expiresAt }) {
    const { count } = await prisma.refreshToken.updateMany({
      where: { id: sessionId, tokenHash: currentTokenHash },
      data: { tokenHash, expiresAt },
    });
    return count === 1;
  },

  async deleteRefreshToken(tokenHash) {
    await prisma.refreshToken.deleteMany({ where: { tokenHash } });
  },
};
