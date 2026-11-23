import { WEEKDAYS } from "../../shared/time/zonedTime.js";
import { AppError } from "../../shared/errors/AppError.js";
import { assertCanListDepartment, assertCanView } from "../credentials/credentials.policy.js";
import { credentialsRepository } from "../credentials/credentials.repository.js";
import { departmentsRepository } from "../departments/departments.repository.js";
import { availabilitiesRepository } from "./availabilities.repository.js";

const UNAVAILABLE_DAY = { morning: false, afternoon: false, night: false };

export function toWeek(rows) {
  return WEEKDAYS.map((weekday) => {
    const { morning, afternoon, night } = rows.find((row) => row.weekday === weekday) ?? UNAVAILABLE_DAY;
    return { weekday, morning, afternoon, night };
  });
}

const isAvailableSomeTime = ({ morning, afternoon, night }) => morning || afternoon || night;

export function createAvailabilitiesService({
  repository = availabilitiesRepository,
  credentials = credentialsRepository,
  departments = departmentsRepository,
} = {}) {
  return {
    async getMine(auth) {
      return toWeek(await repository.findByCredential(auth.id));
    },

    async replaceMine(auth, days) {
      await repository.replaceWeek(auth.id, days.filter(isAvailableSomeTime));
      return toWeek(await repository.findByCredential(auth.id));
    },

    async getMyWorshipService(auth) {
      return { worshipService: await repository.findWorshipService(auth.id) };
    },

    async setMyWorshipService(auth, worshipService) {
      return { worshipService: await repository.setWorshipService(auth.id, worshipService) };
    },

    async getOf(auth, credentialId) {
      const target = await credentials.findById(credentialId);
      if (!target) throw AppError.notFound("Credencial não encontrada");
      assertCanView(auth, target);
      return toWeek(await repository.findByCredential(credentialId));
    },

    async listDepartment(auth, departmentId) {
      if (!(await departments.findById(departmentId))) throw AppError.notFound("Ministério não encontrado");
      assertCanListDepartment(auth, departmentId);

      const members = await repository.listMembersOf(departmentId);
      return members.map(({ availabilities, ...credential }) => ({ credential, week: toWeek(availabilities) }));
    },
  };
}

export const availabilitiesService = createAvailabilitiesService();
