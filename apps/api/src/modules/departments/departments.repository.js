import { prisma } from "../../config/database.js";

const departmentSelect = {
  id: true,
  name: true,
  description: true,
  hasDemands: true,
  _count: { select: { credentials: { where: { pending: false, credential: { role: { not: "DEVELOPER" } } } } } },
};

function toDepartment(row) {
  if (!row) return null;
  const { _count, ...department } = row;
  return { ...department, membersCount: _count.credentials };
}

const isActiveMemberOf = (credentialId) => ({ credentials: { some: { credentialId, pending: false } } });

export const departmentsRepository = {
  async list() {
    const rows = await prisma.department.findMany({ select: departmentSelect, orderBy: { name: "asc" } });
    return rows.map(toDepartment);
  },

  async listByMember(credentialId) {
    const rows = await prisma.department.findMany({
      where: isActiveMemberOf(credentialId),
      select: departmentSelect,
      orderBy: { name: "asc" },
    });
    return rows.map(toDepartment);
  },

  async findById(id) {
    return toDepartment(await prisma.department.findUnique({ where: { id }, select: departmentSelect }));
  },

  async create(data) {
    return toDepartment(await prisma.department.create({ data, select: departmentSelect }));
  },

  async update(id, data) {
    return toDepartment(await prisma.department.update({ where: { id }, data, select: departmentSelect }));
  },

  async delete(id) {
    await prisma.department.delete({ where: { id } });
  },
};
