import { ROLES, isAdmin, isAtLeast } from "../../shared/auth/roles.js";
import { AppError } from "../../shared/errors/AppError.js";

export function assertIsAdmin(actor) {
  if (!isAdmin(actor)) throw AppError.forbidden("Apenas o administrador pode fazer esta ação");
}

export function assertCanUpdate(actor, departmentId) {
  if (isAdmin(actor)) return;
  if (isAtLeast(actor.role, ROLES.DEPARTMENT_MANAGER) && actor.departmentIds.includes(departmentId)) return;
  throw AppError.forbidden("Você só pode editar ministérios dos quais participa como gestor");
}
