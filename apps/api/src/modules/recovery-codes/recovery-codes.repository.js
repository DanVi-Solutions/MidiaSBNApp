import { prisma } from "../../config/database.js";
import { sessionCredentialSelect } from "../../shared/auth/session.js";

export const recoveryCodesRepository = {
  findCredentialByUsername(username) {
    return prisma.credential.findUnique({ where: { username }, select: sessionCredentialSelect });
  },

  countByCredential(credentialId) {
    return prisma.recoveryCode.count({ where: { credentialId } });
  },

  findByCredential(credentialId) {
    return prisma.recoveryCode.findMany({ where: { credentialId }, select: { id: true, codeHash: true } });
  },

  async replaceForCredential(credentialId, codeHashes) {
    await prisma.$transaction([
      prisma.recoveryCode.deleteMany({ where: { credentialId } }),
      prisma.recoveryCode.createMany({ data: codeHashes.map((codeHash) => ({ credentialId, codeHash })) }),
    ]);
  },

  async deleteByCredential(credentialId) {
    await prisma.recoveryCode.deleteMany({ where: { credentialId } });
  },

  async redeem({ credentialId, recoveryCodeId, credentialNumber, refreshToken }) {
    await prisma.$transaction([
      prisma.recoveryCode.delete({ where: { id: recoveryCodeId } }),
      prisma.credential.update({ where: { id: credentialId }, data: { credentialNumber } }),
      prisma.refreshToken.deleteMany({ where: { credentialId } }),
      prisma.refreshToken.create({ data: { credentialId, ...refreshToken } }),
    ]);
  },
};
