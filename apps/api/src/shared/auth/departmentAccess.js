import { AppError } from "../errors/AppError.js";
import { hasDemandManagementRole, hasScheduleManagementRole, isAdmin } from "./roles.js";

export const participatesIn = (actor, departmentId) => actor.departmentIds.includes(departmentId);

export function canManageSchedulesOf(actor, departmentId) {
  if (isAdmin(actor)) return true;
  return hasScheduleManagementRole(actor.role) && participatesIn(actor, departmentId);
}

export function assertCanManageSchedulesOf(actor, departmentId) {
  if (!canManageSchedulesOf(actor, departmentId)) {
    throw AppError.forbidden(
      "Apenas responsável pelas escalas ou acima do ministério (ou administrador) pode gerenciar as escalas dele",
    );
  }
}

export function managedScheduleDepartmentIds(actor) {
  return hasScheduleManagementRole(actor.role) ? actor.departmentIds : [];
}

export function canViewDemandsOf(actor, departmentId) {
  if (isAdmin(actor)) return true;
  return participatesIn(actor, departmentId);
}

export function canCreateDemandsIn(actor, departmentId) {
  if (isAdmin(actor)) return true;
  return participatesIn(actor, departmentId);
}

export function assertCanCreateDemandsIn(actor, departmentId) {
  if (!canCreateDemandsIn(actor, departmentId)) {
    throw AppError.forbidden("Você só pode criar demandas em ministérios dos quais participa");
  }
}

export function canManageDemandsOf(actor, departmentId) {
  if (isAdmin(actor)) return true;
  return hasDemandManagementRole(actor.role) && participatesIn(actor, departmentId);
}

export function assertCanManageDemandsOf(actor, departmentId) {
  if (!canManageDemandsOf(actor, departmentId)) {
    throw AppError.forbidden(
      "Apenas gerente do ministério ou acima (ou administrador) pode gerenciar demandas de terceiros neste ministério",
    );
  }
}
