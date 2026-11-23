import { prisma } from "../../config/database.js";

const eventSelect = {
  id: true,
  name: true,
  description: true,
  weekday: true,
  times: true,
  isGlobal: true,
  createdById: true,
  departments: {
    select: { department: { select: { id: true, name: true } } },
    orderBy: { department: { name: "asc" } },
  },
};

function toRecurringEvent(row) {
  if (!row) return null;
  const departments = (row.departments || []).map((entry) => entry.department).filter(Boolean);
  const singleDepartment = !row.isGlobal && departments.length === 1 ? departments[0] : null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    weekday: row.weekday,
    times: row.times,
    isGlobal: Boolean(row.isGlobal),
    createdById: row.createdById ?? null,
    departments,
    departmentId: singleDepartment?.id ?? null,
    department: singleDepartment ?? null,
  };
}

export const recurringEventsRepository = {
  async list({ departmentIds = null } = {}) {
    const rows = await prisma.recurringEvent.findMany({
      where: departmentIds
        ? { OR: [{ isGlobal: true }, { departments: { some: { departmentId: { in: departmentIds } } } }] }
        : undefined,
      select: eventSelect,
      orderBy: [{ weekday: "asc" }, { name: "asc" }],
    });
    return rows.map(toRecurringEvent);
  },

  async findById(id) {
    return toRecurringEvent(await prisma.recurringEvent.findUnique({ where: { id }, select: eventSelect }));
  },

  async create({ departmentIds = [], isGlobal = false, createdById = null, ...data }) {
    const row = await prisma.recurringEvent.create({
      data: {
        ...data,
        isGlobal: Boolean(isGlobal),
        createdById: createdById ?? null,
        ...(!isGlobal &&
          departmentIds.length > 0 && {
            departments: { create: departmentIds.map((departmentId) => ({ departmentId })) },
          }),
      },
      select: eventSelect,
    });
    return toRecurringEvent(row);
  },

  async update(id, data) {
    return toRecurringEvent(await prisma.recurringEvent.update({ where: { id }, data, select: eventSelect }));
  },

  async promote(id) {
    const row = await prisma.recurringEvent.update({
      where: { id },
      data: {
        isGlobal: true,
        departments: { deleteMany: {} },
      },
      select: eventSelect,
    });
    return toRecurringEvent(row);
  },

  async delete(id) {
    await prisma.recurringEvent.delete({ where: { id } });
  },

  async listAllDepartmentIds() {
    const departments = await prisma.department.findMany({ select: { id: true } });
    return departments.map((department) => department.id);
  },

  findDepartments(ids) {
    return prisma.department.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  },

  async createSchedules(schedules) {
    const { count } = await prisma.schedule.createMany({ data: schedules, skipDuplicates: true });
    return count;
  },
};
