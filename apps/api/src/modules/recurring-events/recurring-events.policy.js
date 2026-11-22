import { assertCanManageSchedulesOf, participatesIn } from "../../shared/auth/departmentAccess.js";
import { ROLES, isAdmin, isAtLeast } from "../../shared/auth/roles.js";
import { AppError } from "../../shared/errors/AppError.js";

export function assertCanSeeEvents(actor) {
  if (!isAtLeast(actor.role, ROLES.SCHEDULER_MANAGER)) {
    throw AppError.forbidden("Apenas scheduler manager ou acima pode ver os eventos recorrentes");
  }
}

export function assertCanSeeEvent(actor, event) {
  assertCanSeeEvents(actor);
  if (event.departmentId && !isAdmin(actor) && !participatesIn(actor, event.departmentId)) {
    throw AppError.forbidden("Este evento é de um ministério do qual você não participa");
  }
}

export function assertCanManageEventOf(actor, departmentId) {
  if (departmentId === null) {
    if (!isAtLeast(actor.role, ROLES.GENERAL_MANAGER)) {
      throw AppError.forbidden("Apenas general manager ou o administrador gerencia eventos gerais");
    }
    return;
  }
  assertCanManageSchedulesOf(actor, departmentId);
}
