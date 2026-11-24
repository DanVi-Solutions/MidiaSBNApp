export const ROLES = Object.freeze({
  DEVELOPER: "DEVELOPER",
  ADMINISTRATOR: "ADMINISTRATOR",
  GENERAL_MANAGER: "GENERAL_MANAGER",
  DEPARTMENT_MANAGER: "DEPARTMENT_MANAGER",
  SCHEDULER_MANAGER: "SCHEDULER_MANAGER",
  VOLUNTEER: "VOLUNTEER",
});

export const ROLE_LIST = Object.values(ROLES);

export const ASSIGNABLE_ROLE_LIST = Object.freeze(ROLE_LIST.filter((role) => role !== ROLES.DEVELOPER));

const RANK = Object.freeze({
  VOLUNTEER: 1,
  SCHEDULER_MANAGER: 2,
  DEPARTMENT_MANAGER: 3,
  GENERAL_MANAGER: 4,
  ADMINISTRATOR: 5,
  DEVELOPER: 6,
});

export const rankOf = (role) => RANK[role] ?? 0;

export const isAtLeast = (role, minimum) => rankOf(role) >= rankOf(minimum);

export const isDeveloper = (credential) => credential?.role === ROLES.DEVELOPER;

export const isAdmin = (credential) =>
  credential?.role === ROLES.ADMINISTRATOR || credential?.role === ROLES.DEVELOPER;

export const hasScheduleManagementRole = (role) =>
  isAtLeast(role, ROLES.DEPARTMENT_MANAGER) || role === ROLES.SCHEDULER_MANAGER;

export const hasDemandManagementRole = (role) => isAtLeast(role, ROLES.DEPARTMENT_MANAGER);
