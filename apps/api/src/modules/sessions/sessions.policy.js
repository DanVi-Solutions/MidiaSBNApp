import { ROLES, isAtLeast } from "../../shared/auth/roles.js";
import { AppError } from "../../shared/errors/AppError.js";
import { canManage } from "../credentials/credentials.policy.js";

export function assertCanManageSessionsOf(actor, target) {
  if (actor.id === target.id) return;
  if (isAtLeast(actor.role, ROLES.DEPARTMENT_MANAGER) && canManage(actor, target)) return;
  throw AppError.forbidden();
}
