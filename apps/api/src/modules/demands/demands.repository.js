import { prisma } from "../../config/database.js";

const personSelect = { select: { id: true, name: true, username: true, role: true } };

const demandSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  dueAt: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  department: { select: { id: true, name: true, hasDemands: true } },
  assignees: {
    select: { credential: personSelect },
    orderBy: { credential: { name: "asc" } },
  },
  createdBy: personSelect,
};

export function toDemand(row) {
  if (!row) return null;
  const rawAssignees = Array.isArray(row.assignees) ? row.assignees : [];
  const assignees = rawAssignees
    .map((item) => item?.credential ?? item)
    .filter((person) => person && person.role !== "DEVELOPER")
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const createdBy = row.createdBy?.role === "DEVELOPER" ? null : row.createdBy;
  return {
    ...row,
    assignees,
    createdBy,
  };
}

export const demandsRepository = {
  async list({ departmentIds = null, departmentId = null, status = null } = {}) {
    const where = {
      department: { hasDemands: true },
      ...(departmentId && { departmentId }),
      ...(departmentIds && !departmentId && { departmentId: { in: departmentIds } }),
      ...(status && { status }),
    };

    const rows = await prisma.demand.findMany({
      where,
      select: demandSelect,
      orderBy: [{ status: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    });
    return rows.map(toDemand);
  },

  async findById(id) {
    return toDemand(await prisma.demand.findUnique({ where: { id }, select: demandSelect }));
  },

  findDepartment(id) {
    return prisma.department.findUnique({
      where: { id },
      select: { id: true, name: true, hasDemands: true },
    });
  },

  async findCandidateById(id) {
    const row = await prisma.credential.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        status: true,
        departments: { where: { pending: false }, select: { departmentId: true } },
      },
    });
    if (!row) return null;
    const { departments, ...rest } = row;
    return { ...rest, departmentIds: departments.map((d) => d.departmentId) };
  },

  listDepartmentCandidates(departmentId) {
    return prisma.credential.findMany({
      where: {
        status: { not: "INACTIVE" },
        role: { notIn: ["DEVELOPER", "ADMINISTRATOR", "GENERAL_MANAGER"] },
        departments: { some: { departmentId, pending: false } },
      },
      select: { id: true, name: true, username: true, role: true },
      orderBy: { name: "asc" },
    });
  },

  async create({ assigneeIds = [], ...data }) {
    return toDemand(
      await prisma.demand.create({
        data: {
          ...data,
          ...(assigneeIds.length > 0 && {
            assignees: { create: assigneeIds.map((credentialId) => ({ credentialId })) },
          }),
        },
        select: demandSelect,
      }),
    );
  },

  async update(id, { assigneeIds, ...data }) {
    return toDemand(
      await prisma.demand.update({
        where: { id },
        data: {
          ...data,
          ...(assigneeIds !== undefined && {
            assignees: {
              deleteMany: {},
              create: assigneeIds.map((credentialId) => ({ credentialId })),
            },
          }),
        },
        select: demandSelect,
      }),
    );
  },

  async delete(id) {
    await prisma.demand.delete({ where: { id } });
  },

  async deleteCompletedBefore(cutoff) {
    const { count } = await prisma.demand.deleteMany({
      where: { status: "COMPLETED", completedAt: { lte: cutoff } },
    });
    return count;
  },
};
