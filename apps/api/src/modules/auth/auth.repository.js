import { prisma } from "../../config/database.js";

const sessionCredentialSelect = { id: true, name: true, username: true, status: true, role: true };

const deleteExpiredRefreshTokens = (credentialId) =>
  prisma.refreshToken.deleteMany({ where: { credentialId, expiresAt: { lt: new Date() } } });

export const authRepository = {
  findCredentialByNumber(credentialNumber) {
    return prisma.credential.findUnique({ where: { credentialNumber }, select: sessionCredentialSelect });
  },

  findCredentialByUsername(username) {
    return prisma.credential.findUnique({ where: { username }, select: sessionCredentialSelect });
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

  async replaceRecoveryCodes(credentialId, codeHashes) {
    await prisma.$transaction([
      prisma.recoveryCode.deleteMany({ where: { credentialId } }),
      prisma.recoveryCode.createMany({ data: codeHashes.map((codeHash) => ({ credentialId, codeHash })) }),
    ]);
  },

  countRecoveryCodes(credentialId) {
    return prisma.recoveryCode.count({ where: { credentialId } });
  },

  findRecoveryCodes(credentialId) {
    return prisma.recoveryCode.findMany({ where: { credentialId }, select: { id: true, codeHash: true } });
  },

  async recoverAccess({ credentialId, recoveryCodeId, credentialNumber, refreshToken }) {
    await prisma.$transaction([
      prisma.recoveryCode.delete({ where: { id: recoveryCodeId } }),
      prisma.credential.update({ where: { id: credentialId }, data: { credentialNumber } }),
      prisma.refreshToken.deleteMany({ where: { credentialId } }),
      prisma.refreshToken.create({ data: { credentialId, ...refreshToken } }),
    ]);
  },
};
