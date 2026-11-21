export const ROLES = Object.freeze({
  ADMINISTRATOR: "ADMINISTRATOR",
  GENERAL_MANAGER: "GENERAL_MANAGER",
  DEPARTMENT_MANAGER: "DEPARTMENT_MANAGER",
  SCHEDULER_MANAGER: "SCHEDULER_MANAGER",
  VOLUNTEER: "VOLUNTEER",
});

export const ROLE_LIST = Object.values(ROLES);

const RANK = Object.freeze({
  VOLUNTEER: 1,
  SCHEDULER_MANAGER: 2,
  DEPARTMENT_MANAGER: 3,
  GENERAL_MANAGER: 4,
  ADMINISTRATOR: 5,
});

export const rankOf = (role) => RANK[role] ?? 0;

export const isAtLeast = (role, minimum) => rankOf(role) >= rankOf(minimum);

export const isAdmin = (credential) => credential.role === ROLES.ADMINISTRATOR;
