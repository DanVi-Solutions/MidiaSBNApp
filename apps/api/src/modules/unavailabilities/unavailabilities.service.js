import { AppError } from "../../shared/errors/AppError.js";
import { assertCanListDepartment, assertCanView } from "../credentials/credentials.policy.js";
import { credentialsRepository } from "../credentials/credentials.repository.js";
import { departmentsRepository } from "../departments/departments.repository.js";
import { unavailabilitiesRepository } from "./unavailabilities.repository.js";

const DEFAULT_RANGE_DAYS = 60;

const daysFromNow = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

const withoutReason = ({ reason, ...unavailability }) => unavailability;

function ensureValidRange({ startAt, endAt }) {
  if (endAt <= startAt) throw AppError.unprocessable("O fim precisa ser depois do início");
  if (endAt <= new Date()) throw AppError.unprocessable("O período informado já terminou");
}

export function createUnavailabilitiesService({
  repository = unavailabilitiesRepository,
  credentials = credentialsRepository,
  departments = departmentsRepository,
} = {}) {
  async function findMine(auth, id) {
    const unavailability = await repository.findOwned(id, auth.id);
    if (!unavailability) throw AppError.notFound("Indisponibilidade não encontrada");
    return unavailability;
  }

  async function withConflicts(auth, unavailability) {
    const conflictingAssignments = await repository.findAssignmentsDuring(auth.id, unavailability);
    return { ...unavailability, conflictingAssignments };
  }

  return {
    listMine(auth, { from = new Date(), to }) {
      return repository.listByCredential(auth.id, { from, to });
    },

    async listOf(auth, credentialId, { from = new Date(), to }) {
      const target = await credentials.findById(credentialId);
      if (!target) throw AppError.notFound("Credencial não encontrada");
      assertCanView(auth, target);

      const unavailabilities = await repository.listByCredential(credentialId, { from, to });
      return auth.id === credentialId ? unavailabilities : unavailabilities.map(withoutReason);
    },

    async listDepartment(auth, departmentId, { from = new Date(), to = daysFromNow(DEFAULT_RANGE_DAYS) }) {
      if (!(await departments.findById(departmentId))) throw AppError.notFound("Ministério não encontrado");
      assertCanListDepartment(auth, departmentId);

      const unavailabilities = await repository.listByDepartment(departmentId, { from, to });
      return unavailabilities.map((item) => (item.credential.id === auth.id ? item : withoutReason(item)));
    },

    async create(auth, data) {
      ensureValidRange(data);
      return withConflicts(auth, await repository.create(auth.id, data));
    },

    async update(auth, id, changes) {
      const current = await findMine(auth, id);
      ensureValidRange({ ...current, ...changes });
      return withConflicts(auth, await repository.update(id, changes));
    },

    async delete(auth, id) {
      await findMine(auth, id);
      await repository.delete(id);
    },
  };
}

export const unavailabilitiesService = createUnavailabilitiesService();
