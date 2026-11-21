import { prisma } from "../../config/database.js";
import { sessionCredentialSelect } from "../../shared/auth/session.js";

const deleteExpiredRefreshTokens = (credentialId) =>
  prisma.refreshToken.deleteMany({ where: { credentialId, expiresAt: { lt: new Date() } } });

export const authRepository = {
  findCredentialByNumber(credentialNumber) {
    return prisma.credential.findUnique({ where: { credentialNumber }, select: sessionCredentialSelect });
  },

  async createRefreshToken(credentialId, { tokenHash, expiresAt }) {
    await prisma.$transaction([
      deleteExpiredRefreshTokens(credentialId),
      prisma.refreshToken.create({ data: { credentialId, tokenHash, expiresAt } }),
    ]);
  },

  findRefreshToken(tokenHash) {
    return prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { credential: { select: sessionCredentialSelect } },
    });
  },

  async rotateRefreshToken(currentTokenId, credentialId, { tokenHash, expiresAt }) {
    await prisma.$transaction([
      prisma.refreshToken.delete({ where: { id: currentTokenId } }),
      prisma.refreshToken.create({ data: { credentialId, tokenHash, expiresAt } }),
    ]);
  },

  async deleteRefreshToken(tokenHash) {
    await prisma.refreshToken.deleteMany({ where: { tokenHash } });
  },

  async deleteAllRefreshTokens(credentialId) {
    await prisma.refreshToken.deleteMany({ where: { credentialId } });
  },
};
