import { ROLES, isAdmin, isAtLeast, rankOf } from "../../shared/auth/roles.js";
import { AppError } from "../../shared/errors/AppError.js";

const MAX_ASSIGNABLE_ROLE = {
  [ROLES.ADMINISTRATOR]: ROLES.ADMINISTRATOR,
  [ROLES.GENERAL_MANAGER]: ROLES.GENERAL_MANAGER,
  [ROLES.DEPARTMENT_MANAGER]: ROLES.SCHEDULER_MANAGER,
};

const isSelf = (actor, target) => actor.id === target.id;

export function sharesDepartment(actor, target) {
  return target.departmentIds.some((id) => actor.departmentIds.includes(id));
}

export function canManage(actor, target) {
  if (isAdmin(actor)) return true;
  return rankOf(actor.role) > rankOf(target.role) && sharesDepartment(actor, target);
}

export function assertDepartmentCount(role, departmentIds) {
  const count = departmentIds.length;

  if (role === ROLES.ADMINISTRATOR && count !== 0) {
    throw AppError.unprocessable("Administradores não pertencem a departamentos");
  }
  if (role === ROLES.GENERAL_MANAGER && count < 1) {
    throw AppError.unprocessable("General manager precisa de ao menos um departamento");
  }
  if (role !== ROLES.ADMINISTRATOR && role !== ROLES.GENERAL_MANAGER && count !== 1) {
    throw AppError.unprocessable("Este papel exige exatamente um departamento");
  }
}

export function assertCanAssign(actor, role, departmentIds) {
  const maxRole = MAX_ASSIGNABLE_ROLE[actor.role];
  if (!maxRole) throw AppError.forbidden("Seu papel não permite atribuir papéis");

  if (rankOf(role) > rankOf(maxRole)) {
    throw AppError.forbidden(`Você não pode atribuir o papel ${role}`);
  }

  assertDepartmentCount(role, departmentIds);

  if (!isAdmin(actor) && departmentIds.some((id) => !actor.departmentIds.includes(id))) {
    throw AppError.forbidden("Você só pode usar departamentos dos quais participa");
  }
}

export function assertCanCreate(actor, { role, departmentIds }) {
  assertCanAssign(actor, role, departmentIds);
}

export function assertCanView(actor, target) {
  if (isSelf(actor, target) || isAdmin(actor)) return;
  if (isAtLeast(actor.role, ROLES.SCHEDULER_MANAGER) && sharesDepartment(actor, target)) return;
  throw AppError.forbidden();
}

export function assertCanList(actor) {
  if (!isAtLeast(actor.role, ROLES.SCHEDULER_MANAGER)) throw AppError.forbidden();
}

export function assertCanChangeRole(actor, target, role, departmentIds) {
  if (isSelf(actor, target)) throw AppError.forbidden("Você não pode alterar o próprio papel");
  if (!canManage(actor, target)) throw AppError.forbidden();
  assertCanAssign(actor, role, departmentIds);
}

export function assertCanDelete(actor, target) {
  if (isSelf(actor, target)) return;
  if (isAtLeast(actor.role, ROLES.GENERAL_MANAGER) && canManage(actor, target)) return;
  throw AppError.forbidden();
}

export function assertCanRegenerateNumber(actor, target) {
  if (isSelf(actor, target)) return;
  if (isAtLeast(actor.role, ROLES.DEPARTMENT_MANAGER) && canManage(actor, target)) return;
  throw AppError.forbidden();
}

export function assertCanChangeStatus(actor, target, status) {
  if (target.status === status) throw AppError.conflict(`A credencial já está ${status}`);
  if (target.status === "PENDING") {
    throw AppError.conflict("Credencial pendente: o primeiro acesso é que a ativa");
  }

  const isManager = isAtLeast(actor.role, ROLES.GENERAL_MANAGER) && canManage(actor, target);
  if (status === "INACTIVE" && (isSelf(actor, target) || isManager)) return;
  if (status === "ACTIVE" && isManager) return;
  throw AppError.forbidden();
}

export function assertCanSetDepartments(actor, target, departmentIds) {
  if (!isAdmin(actor)) throw AppError.forbidden("Apenas administradores editam departamentos");
  assertDepartmentCount(target.role, departmentIds);
}

export function assertCanTransfer(actor, target, { fromDepartmentId, toDepartmentId }) {
  if (!isAtLeast(actor.role, ROLES.GENERAL_MANAGER)) throw AppError.forbidden();
  if (!canManage(actor, target)) throw AppError.forbidden();

  if (fromDepartmentId === toDepartmentId) {
    throw AppError.unprocessable("Origem e destino devem ser diferentes");
  }
  if (!target.departmentIds.includes(fromDepartmentId)) {
    throw AppError.unprocessable("A credencial não pertence ao departamento de origem");
  }
  if (target.departmentIds.includes(toDepartmentId)) {
    throw AppError.conflict("A credencial já pertence ao departamento de destino");
  }
  if (!isAdmin(actor) && !actor.departmentIds.includes(fromDepartmentId)) {
    throw AppError.forbidden("Você só pode transferir a partir de departamentos dos quais participa");
  }

  return { immediate: isAdmin(actor) || actor.departmentIds.includes(toDepartmentId) };
}

export function assertCanReviewTransfer(actor, toDepartmentId) {
  if (isAdmin(actor)) return;
  if (actor.role === ROLES.GENERAL_MANAGER && actor.departmentIds.includes(toDepartmentId)) return;
  throw AppError.forbidden("Apenas um general manager do departamento de destino pode revisar");
}

export function assertCanListTransfers(actor) {
  if (!isAdmin(actor) && actor.role !== ROLES.GENERAL_MANAGER) throw AppError.forbidden();
}
