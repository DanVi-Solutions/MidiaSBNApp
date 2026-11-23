import { ROLES, isAdmin, isAtLeast } from "../../shared/auth/roles.js";
import { AppError } from "../../shared/errors/AppError.js";
import { isPrismaError, isUniqueViolationOn } from "../../shared/errors/prismaErrors.js";
import { assertCanListDepartmentMembers, assertCanViewMember } from "../credentials/credentials.policy.js";
import { toPublicCredential } from "../credentials/credentials.presenter.js";
import { credentialsRepository } from "../credentials/credentials.repository.js";
import { assertCanUpdate, assertIsAdmin } from "./departments.policy.js";
import { departmentsRepository } from "./departments.repository.js";

export function createDepartmentsService({
  repository = departmentsRepository,
  credentials = credentialsRepository,
} = {}) {
  async function findDepartment(id) {
    const department = await repository.findById(id);
    if (!department) throw AppError.notFound("Ministério não encontrado");
    return department;
  }

  async function translateNameConflict(operation) {
    try {
      return await operation();
    } catch (error) {
      if (isUniqueViolationOn(error, "department_name")) throw AppError.conflict("Já existe um ministério com esse nome");
      throw error;
    }
  }

  return {
    list() {
      return repository.list();
    },

    getById(id) {
      return findDepartment(id);
    },

    listMine(auth) {
      return repository.listByMember(auth.id);
    },

    async listOf(auth, credentialId) {
      const target = await credentials.findById(credentialId);
      if (!target) throw AppError.notFound("Credencial não encontrada");
      assertCanViewMember(auth, target);
      return repository.listByMember(credentialId);
    },

    async listMembers(auth, id) {
      await findDepartment(id);
      assertCanListDepartmentMembers(auth, id);
      const seesActualStatus = isAtLeast(auth.role, ROLES.DEPARTMENT_MANAGER);
      const members = await credentials.list({
        departmentIds: [id],
        excludeRoles: isAdmin(auth) ? null : [ROLES.ADMINISTRATOR],
        statuses: seesActualStatus ? null : ["ACTIVE", "RECOVERING"],
      });
      return members.map((item) => {
        const pub = toPublicCredential(item);
        return !seesActualStatus && pub?.status === "RECOVERING"
          ? { ...pub, status: "ACTIVE" }
          : pub;
      });
    },

    create(auth, data) {
      assertIsAdmin(auth);
      return translateNameConflict(() => repository.create(data));
    },

    async update(auth, id, data) {
      await findDepartment(id);
      assertCanUpdate(auth, id);
      return translateNameConflict(() => repository.update(id, data));
    },

    async delete(auth, id) {
      assertIsAdmin(auth);
      const department = await findDepartment(id);

      if (department.membersCount > 0) {
        throw AppError.conflict(
          "O ministério ainda tem membros. Transfira-os para outro ministério antes de excluir.",
        );
      }

      try {
        await repository.delete(id);
      } catch (error) {
        if (isPrismaError(error, "P2003")) {
          throw AppError.conflict("O ministério possui escalas e não pode ser excluído, para preservar o histórico.");
        }
        throw error;
      }
    },
  };
}

export const departmentsService = createDepartmentsService();
