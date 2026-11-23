import { prisma } from "../../config/database.js";

const departmentRef = { select: { id: true, name: true } };

const credentialSelect = {
  id: true,
  name: true,
  username: true,
  status: true,
  role: true,
  credentialNumber: true,
  departments: {
    select: {
      id: true,
      pending: true,
      department: departmentRef,
      transferFromDepartment: departmentRef,
      transferRequestedBy: { select: { id: true, name: true } },
    },
  },
};

function toCredential(row) {
  if (!row) return null;

  const { departments, ...rest } = row;
  const active = departments.filter((d) => !d.pending);
  const pending = departments.find((d) => d.pending);

  return {
    ...rest,
    departmentIds: active.map((d) => d.department.id),
    departments: active.map((d) => d.department),
    pendingTransfer: pending
      ? {
          id: pending.id,
          from: pending.transferFromDepartment,
          to: pending.department,
          requestedBy: pending.transferRequestedBy,
        }
      : null,
  };
}

const transferInclude = {
  credential: { select: { id: true, name: true, username: true, role: true } },
  department: departmentRef,
  transferFromDepartment: departmentRef,
  transferRequestedBy: { select: { id: true, name: true } },
};

function toTransfer(row) {
  return {
    id: row.id,
    credential: row.credential,
    from: row.transferFromDepartment,
    to: row.department,
    requestedBy: row.transferRequestedBy,
  };
}

const cancelPendingTransfers = (credentialId) =>
  prisma.credentialDepartment.deleteMany({ where: { credentialId, pending: true } });

const endAllSessions = (credentialId) => prisma.refreshToken.deleteMany({ where: { credentialId } });

const updateCredential = (id, data) =>
  prisma.credential.update({ where: { id }, data, select: credentialSelect });

export const credentialsRepository = {
  async findAuthById(id) {
    const row = await prisma.credential.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        status: true,
        departments: { where: { pending: false }, select: { departmentId: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      role: row.role,
      status: row.status,
      departmentIds: row.departments.map((d) => d.departmentId),
    };
  },

  async findById(id) {
    return toCredential(await prisma.credential.findUnique({ where: { id }, select: credentialSelect }));
  },

  async list({ departmentIds = null, excludeRoles = null, statuses = null } = {}) {
    const where = {};
    if (departmentIds) {
      where.departments = { some: { pending: false, departmentId: { in: departmentIds } } };
    }
    if (excludeRoles?.length) {
      where.role = { notIn: excludeRoles };
    }
    if (statuses?.length) {
      where.status = { in: statuses };
    }

    const rows = await prisma.credential.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      select: credentialSelect,
      orderBy: { name: "asc" },
    });
    return rows.map(toCredential);
  },

  async create({ name, role, credentialNumber, departmentIds }) {
    const row = await prisma.credential.create({
      data: {
        name,
        role,
        credentialNumber,
        status: "PENDING",
        departments: { create: departmentIds.map((departmentId) => ({ departmentId })) },
      },
      select: credentialSelect,
    });
    return toCredential(row);
  },

  async countDepartments(ids) {
    return prisma.department.count({ where: { id: { in: ids } } });
  },

  async isUsernameTaken(username, exceptId) {
    const row = await prisma.credential.findFirst({
      where: { username, ...(exceptId && { id: { not: exceptId } }) },
      select: { id: true },
    });
    return Boolean(row);
  },

  async isCredentialNumberTaken(credentialNumber, credentialNumberHash) {
    const row = await prisma.credential.findFirst({
      where: { OR: [{ credentialNumber }, { credentialNumberHash }] },
      select: { id: true },
    });
    return Boolean(row);
  },

  async update(id, data) {
    return toCredential(await updateCredential(id, data));
  },

  async delete(id) {
    await prisma.$transaction([
      prisma.credentialSchedule.updateMany({
        where: { credentialChangeId: id },
        data: { changeStatus: "NONE", credentialChangeId: null },
      }),
      prisma.credential.delete({ where: { id } }),
    ]);
  },

  async activateWithHashedNumber(id, credentialNumberHash, data = {}) {
    const row = await updateCredential(id, {
      ...data,
      status: "ACTIVE",
      credentialNumber: null,
      credentialNumberHash,
    });
    return toCredential(row);
  },

  async rotateHashedNumber(id, credentialNumberHash, newSession) {
    const [, , session] = await prisma.$transaction([
      prisma.credential.update({ where: { id }, data: { credentialNumberHash } }),
      endAllSessions(id),
      prisma.refreshToken.create({ data: { credentialId: id, ...newSession }, select: { id: true } }),
    ]);
    return session.id;
  },

  async issueReadableNumber(id, credentialNumber, status) {
    const [row] = await prisma.$transaction([
      updateCredential(id, { status, credentialNumber, credentialNumberHash: null }),
      endAllSessions(id),
    ]);
    return toCredential(row);
  },

  async deactivate(id) {
    const [row] = await prisma.$transaction([
      updateCredential(id, { status: "INACTIVE", credentialNumber: null }),
      endAllSessions(id),
    ]);
    return toCredential(row);
  },

  async replaceDepartments(id, departmentIds, role) {
    await prisma.$transaction([
      prisma.credentialDepartment.deleteMany({ where: { credentialId: id } }),
      prisma.credentialDepartment.createMany({
        data: departmentIds.map((departmentId) => ({ credentialId: id, departmentId })),
      }),
      ...(role ? [prisma.credential.update({ where: { id }, data: { role } })] : []),
    ]);
    return this.findById(id);
  },

  async moveDepartment(credentialId, fromDepartmentId, toDepartmentId) {
    await prisma.$transaction([
      cancelPendingTransfers(credentialId),
      prisma.credentialDepartment.update({
        where: { credentialId_departmentId: { credentialId, departmentId: fromDepartmentId } },
        data: { departmentId: toDepartmentId },
      }),
    ]);
  },

  async hasPendingTransfer(credentialId) {
    const count = await prisma.credentialDepartment.count({ where: { credentialId, pending: true } });
    return count > 0;
  },

  async createPendingTransfer({ credentialId, fromDepartmentId, toDepartmentId, requestedById }) {
    const row = await prisma.credentialDepartment.create({
      data: {
        credentialId,
        departmentId: toDepartmentId,
        pending: true,
        transferFromDepartmentId: fromDepartmentId,
        transferRequestedById: requestedById,
      },
      include: transferInclude,
    });
    return toTransfer(row);
  },

  async findPendingTransfer(id) {
    const row = await prisma.credentialDepartment.findFirst({
      where: { id, pending: true },
      include: transferInclude,
    });
    return row && { ...toTransfer(row), credentialId: row.credentialId };
  },

  async listPendingTransfers({ toDepartmentIds = null } = {}) {
    const rows = await prisma.credentialDepartment.findMany({
      where: { pending: true, ...(toDepartmentIds && { departmentId: { in: toDepartmentIds } }) },
      include: transferInclude,
      orderBy: { id: "asc" },
    });
    return rows.map(toTransfer);
  },

  async approveTransfer({ id, credentialId, from, to }) {
    await prisma.$transaction(async (tx) => {
      await tx.credentialDepartment.delete({ where: { id } });

      const moved = await tx.credentialDepartment.updateMany({
        where: { credentialId, departmentId: from.id, pending: false },
        data: { departmentId: to.id },
      });

      if (moved.count === 0) {
        await tx.credentialDepartment.create({ data: { credentialId, departmentId: to.id } });
      }
    });
  },

  async rejectTransfer(id) {
    await prisma.credentialDepartment.delete({ where: { id } });
  },
};
