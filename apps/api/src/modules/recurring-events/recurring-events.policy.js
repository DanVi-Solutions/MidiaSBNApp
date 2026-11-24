import { participatesIn } from "../../shared/auth/departmentAccess.js";
import { ROLES, hasScheduleManagementRole, isAdmin, isAtLeast } from "../../shared/auth/roles.js";
import { AppError } from "../../shared/errors/AppError.js";

function eventDepartmentIds(event) {
  if (Array.isArray(event?.departments) && event.departments.length > 0) {
    return event.departments.map((department) => department.id).filter(Boolean);
  }
  return event?.departmentId ? [event.departmentId] : [];
}

export function assertCanSeeEvents(actor) {
  if (!hasScheduleManagementRole(actor.role)) {
    throw AppError.forbidden("Apenas responsável pelas escalas ou acima pode ver os eventos recorrentes");
  }
}

export function assertCanSeeEvent(actor, event) {
  assertCanSeeEvents(actor);
  if (isAdmin(actor) || event.isGlobal) return;
  const scopedIds = eventDepartmentIds(event);
  if (!scopedIds.some((id) => participatesIn(actor, id))) {
    throw AppError.forbidden("Este evento é restrito a ministérios dos quais você não participa");
  }
}

export function assertCanCreateEvent(actor) {
  if (!isAtLeast(actor.role, ROLES.GENERAL_MANAGER)) {
    throw AppError.forbidden("Apenas o líder geral ou administrador pode criar eventos recorrentes");
  }
}

export function assertCanManageEvent(actor, event) {
  if (isAdmin(actor)) return;
  if (actor.role !== ROLES.GENERAL_MANAGER) {
    throw AppError.forbidden("Apenas o líder geral ou administrador pode editar ou excluir eventos recorrentes");
  }
  if (event.isGlobal) {
    throw AppError.forbidden("Eventos globais só podem ser editados ou excluídos por administradores");
  }
  if (event.createdById) {
    if (event.createdById !== actor.id) {
      throw AppError.forbidden("Você só pode editar ou excluir eventos recorrentes que você criou");
    }
    return;
  }
  const scopedIds = eventDepartmentIds(event);
  if (!scopedIds.some((id) => participatesIn(actor, id))) {
    throw AppError.forbidden("Você só pode editar ou excluir eventos recorrentes dos ministérios que você gerencia");
  }
}

export function assertCanPromoteEvent(actor) {
  if (!isAdmin(actor)) {
    throw AppError.forbidden("Apenas administradores podem promover eventos recorrentes para todos os ministérios");
  }
}
