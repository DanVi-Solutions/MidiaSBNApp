import { prisma } from "../../config/database.js";

const eventSelect = {
  id: true,
  name: true,
  description: true,
  weekday: true,
  times: true,
  departmentId: true,
  department: { select: { id: true, name: true } },
};

export const recurringEventsRepository = {
  list({ departmentIds = null } = {}) {
    return prisma.recurringEvent.findMany({
      where: departmentIds ? { OR: [{ departmentId: null }, { departmentId: { in: departmentIds } }] } : undefined,
      select: eventSelect,
      orderBy: [{ weekday: "asc" }, { name: "asc" }],
    });
  },

  findById(id) {
    return prisma.recurringEvent.findUnique({ where: { id }, select: eventSelect });
  },

  create(data) {
    return prisma.recurringEvent.create({ data, select: eventSelect });
  },

  update(id, data) {
    return prisma.recurringEvent.update({ where: { id }, data, select: eventSelect });
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
