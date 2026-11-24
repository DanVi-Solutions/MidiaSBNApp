import { ROLES, isAdmin } from "../../shared/auth/roles.js";
import { AppError } from "../../shared/errors/AppError.js";

export const canEditAgenda = (actor) => isAdmin(actor) || actor.role === ROLES.GENERAL_MANAGER;

export function assertCanEditAgenda(actor) {
  if (!canEditAgenda(actor)) {
    throw AppError.forbidden("Apenas líderes gerais e administradores podem editar a Agenda Sobrenatural");
  }
}

export function assertCanIndicateDepartments(actor, departmentIds) {
  if (isAdmin(actor)) return;
  const managed = new Set(actor.departmentIds);
  if (departmentIds.some((departmentId) => !managed.has(departmentId))) {
    throw AppError.forbidden("Você só pode indicar ou retirar os ministérios que gerencia");
  }
}

export function assertUpcoming(lastSlotAt, now = new Date()) {
  if (lastSlotAt <= now) {
    throw AppError.conflict("Este evento já aconteceu e não pode mais ser alterado");
  }
}
