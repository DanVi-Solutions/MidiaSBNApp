import { AppError } from "../errors/AppError.js";
import { ROLES, isAdmin, isAtLeast } from "./roles.js";

export const participatesIn = (actor, departmentId) => actor.departmentIds.includes(departmentId);

export function canManageSchedulesOf(actor, departmentId) {
  if (isAdmin(actor)) return true;
  return isAtLeast(actor.role, ROLES.SCHEDULER_MANAGER) && participatesIn(actor, departmentId);
}

export function assertCanManageSchedulesOf(actor, departmentId) {
  if (!canManageSchedulesOf(actor, departmentId)) {
    throw AppError.forbidden(
      "Apenas scheduler manager ou acima do ministério (ou o administrador) pode gerenciar as escalas dele",
    );
  }
}

export function managedScheduleDepartmentIds(actor) {
  return isAtLeast(actor.role, ROLES.SCHEDULER_MANAGER) ? actor.departmentIds : [];
}
