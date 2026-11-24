export const ROLES = Object.freeze({
  DEVELOPER: "DEVELOPER",
  ADMINISTRATOR: "ADMINISTRATOR",
  GENERAL_MANAGER: "GENERAL_MANAGER",
  DEPARTMENT_MANAGER: "DEPARTMENT_MANAGER",
  SCHEDULER_MANAGER: "SCHEDULER_MANAGER",
  VOLUNTEER: "VOLUNTEER",
});

export const ROLE_LIST = Object.freeze(Object.values(ROLES));

const RANK = Object.freeze({
  [ROLES.VOLUNTEER]: 1,
  [ROLES.SCHEDULER_MANAGER]: 2,
  [ROLES.DEPARTMENT_MANAGER]: 3,
  [ROLES.GENERAL_MANAGER]: 4,
  [ROLES.ADMINISTRATOR]: 5,
  [ROLES.DEVELOPER]: 6,
});

export const ROLE_LABELS = Object.freeze({
  [ROLES.DEVELOPER]: "Desenvolvedor",
  [ROLES.ADMINISTRATOR]: "Administrador",
  [ROLES.GENERAL_MANAGER]: "Líder Geral",
  [ROLES.DEPARTMENT_MANAGER]: "Gerente do Ministério",
  [ROLES.SCHEDULER_MANAGER]: "Responsável das Escalas",
  [ROLES.VOLUNTEER]: "Membro Voluntário",
});

export const CREDENTIAL_STATUS = Object.freeze({
  ACTIVE: "ACTIVE",
  INACTIVE: "INACTIVE",
  PENDING: "PENDING",
  RECOVERING: "RECOVERING",
});

export const STATUS_META = Object.freeze({
  [CREDENTIAL_STATUS.ACTIVE]: {
    label: "Ativo",
    tone: "active",
    accessBadgeLabel: "Acesso ativo",
  },
  [CREDENTIAL_STATUS.PENDING]: {
    label: "Primeiro acesso",
    tone: "pending",
    accessBadgeLabel: "Primeiro acesso pendente",
  },
  [CREDENTIAL_STATUS.RECOVERING]: {
    label: "Recuperação",
    tone: "recovering",
    accessBadgeLabel: "Recuperação pendente",
  },
  [CREDENTIAL_STATUS.INACTIVE]: {
    label: "Inativo",
    tone: "revoked",
    accessBadgeLabel: "Acesso inativo",
  },
});

const MAX_ASSIGNABLE_ROLE = Object.freeze({
  [ROLES.DEVELOPER]: ROLES.ADMINISTRATOR,
  [ROLES.ADMINISTRATOR]: ROLES.ADMINISTRATOR,
  [ROLES.GENERAL_MANAGER]: ROLES.GENERAL_MANAGER,
  [ROLES.DEPARTMENT_MANAGER]: ROLES.SCHEDULER_MANAGER,
});

export function resolveRoleCode(entityOrRole) {
  if (!entityOrRole) return "";
  if (typeof entityOrRole === "string") {
    return RANK[entityOrRole] ? entityOrRole : "";
  }
  const candidate = entityOrRole.roleCode ?? entityOrRole.role ?? "";
  return RANK[candidate] ? candidate : "";
}

export function resolveStatusCode(entityOrStatus) {
  if (!entityOrStatus) return "";
  if (typeof entityOrStatus === "string") return entityOrStatus;
  return entityOrStatus.status ?? "";
}

export function rankOf(entityOrRole) {
  const code = resolveRoleCode(entityOrRole);
  return RANK[code] ?? 0;
}

export function isAtLeast(entityOrRole, minimumRole) {
  return rankOf(entityOrRole) >= rankOf(minimumRole);
}

export function isDeveloper(entityOrRole) {
  return resolveRoleCode(entityOrRole) === ROLES.DEVELOPER;
}

export function isAdmin(entityOrRole) {
  const code = resolveRoleCode(entityOrRole);
  return code === ROLES.ADMINISTRATOR || code === ROLES.DEVELOPER;
}

export function hasScheduleManagementRole(entityOrRole) {
  const code = resolveRoleCode(entityOrRole);
  return (
    isAtLeast(code, ROLES.DEPARTMENT_MANAGER) || code === ROLES.SCHEDULER_MANAGER
  );
}

export function hasDemandManagementRole(entityOrRole) {
  return isAtLeast(resolveRoleCode(entityOrRole), ROLES.DEPARTMENT_MANAGER);
}

export function getRoleLabel(entityOrRole) {
  const code = resolveRoleCode(entityOrRole);
  return ROLE_LABELS[code] || "Participante";
}

export function getDepartmentIds(entity) {
  if (!entity) return [];
  if (Array.isArray(entity.departmentIds)) {
    return entity.departmentIds.filter(Boolean);
  }
  if (Array.isArray(entity.departments)) {
    return entity.departments.map((dept) => dept?.id).filter(Boolean);
  }
  return [];
}

export function sharesDepartment(actor, target) {
  const actorIds = getDepartmentIds(actor);
  const targetIds = getDepartmentIds(target);
  return targetIds.some((id) => actorIds.includes(id));
}

export function canManage(actor, target) {
  if (!actor || !target) return false;
  if (isDeveloper(target)) return false;
  if (isAdmin(actor)) return true;
  return rankOf(actor) > rankOf(target) && sharesDepartment(actor, target);
}

export function canListCredentials(actor) {
  return isAtLeast(actor, ROLES.VOLUNTEER);
}

export function canSeeActualMemberStatus(actor) {
  return isAtLeast(actor, ROLES.DEPARTMENT_MANAGER);
}

export function getDisplayMemberStatus(actor, target) {
  const rawStatus = resolveStatusCode(target) || CREDENTIAL_STATUS.ACTIVE;
  if (
    !canSeeActualMemberStatus(actor) &&
    rawStatus === CREDENTIAL_STATUS.RECOVERING
  ) {
    return CREDENTIAL_STATUS.ACTIVE;
  }
  return rawStatus;
}

export function canViewParticipant(actor, target) {
  if (!actor || !target) return false;
  if (isDeveloper(target)) return false;
  if (isAdmin(actor)) return true;
  if (actor.id && target.id && actor.id === target.id) return true;
  if (isAdmin(target)) return false;
  if (!sharesDepartment(actor, target)) return false;
  if (canSeeActualMemberStatus(actor)) return true;
  const rawStatus = resolveStatusCode(target) || CREDENTIAL_STATUS.ACTIVE;
  return (
    rawStatus === CREDENTIAL_STATUS.ACTIVE ||
    rawStatus === CREDENTIAL_STATUS.RECOVERING
  );
}

export function getAssignableRoles(actor) {
  const actorRole = resolveRoleCode(actor);
  const maxRole = MAX_ASSIGNABLE_ROLE[actorRole];
  if (!maxRole) return [];

  const maxRank = rankOf(maxRole);
  return [
    ROLES.VOLUNTEER,
    ROLES.SCHEDULER_MANAGER,
    ROLES.DEPARTMENT_MANAGER,
    ROLES.GENERAL_MANAGER,
    ROLES.ADMINISTRATOR,
  ].filter((role) => rankOf(role) <= maxRank);
}

export function getParticipantFormRoles(actor) {
  return getAssignableRoles(actor).filter(
    (role) => role !== ROLES.GENERAL_MANAGER
  );
}

export function canCreateCredential(actor) {
  return getAssignableRoles(actor).length > 0;
}

export function getDepartmentRequirement(role) {
  const code = resolveRoleCode(role);
  if (code === ROLES.ADMINISTRATOR || code === ROLES.DEVELOPER) {
    return { mode: "none", min: 0, max: 0 };
  }
  if (code === ROLES.GENERAL_MANAGER) {
    return { mode: "multiple", min: 1, max: 50 };
  }
  return { mode: "single", min: 1, max: 1 };
}

export function getAssignableDepartments(actor, allDepartments = []) {
  if (!actor) return [];
  if (isAdmin(actor)) {
    return Array.isArray(allDepartments) ? allDepartments : [];
  }

  const allowedIds = new Set(getDepartmentIds(actor));
  const fromCatalog = (allDepartments || []).filter((dept) =>
    allowedIds.has(dept?.id)
  );
  if (fromCatalog.length > 0) {
    return fromCatalog;
  }

  return Array.isArray(actor.departments) ? actor.departments : [];
}

export function canHandOutCredentialNumber(actor, target) {
  if (!actor || !target) return false;
  return (
    actor.id !== target.id &&
    isAtLeast(actor, ROLES.DEPARTMENT_MANAGER) &&
    canManage(actor, target)
  );
}

export function canCopyCredentialNumber(actor, target) {
  if (!canHandOutCredentialNumber(actor, target)) return false;
  const status = resolveStatusCode(target);
  return (
    status === CREDENTIAL_STATUS.PENDING ||
    status === CREDENTIAL_STATUS.RECOVERING
  );
}

export function canRegenerateCredentialNumber(actor, target) {
  if (!actor || !target) return false;
  if (resolveStatusCode(target) === CREDENTIAL_STATUS.INACTIVE) {
    return false;
  }
  if (actor.id === target.id) {
    return true;
  }
  return canHandOutCredentialNumber(actor, target);
}

export function canEditParticipant(actor, target) {
  if (!actor || !target || actor.id === target.id) return false;
  return isAtLeast(actor, ROLES.DEPARTMENT_MANAGER) && canManage(actor, target);
}

export function canToggleStatus(actor, target) {
  if (!actor || !target || actor.id === target.id) return false;
  if (resolveStatusCode(target) === CREDENTIAL_STATUS.PENDING) {
    return false;
  }
  return isAtLeast(actor, ROLES.DEPARTMENT_MANAGER) && canManage(actor, target);
}

export function canDeleteParticipant(actor, target) {
  if (!actor || !target || actor.id === target.id) return false;
  return isAtLeast(actor, ROLES.DEPARTMENT_MANAGER) && canManage(actor, target);
}

export function canAssignMemberToSchedule(actor, target) {
  if (!actor || !target) return false;
  const targetRole = resolveRoleCode(target);
  if (targetRole === ROLES.ADMINISTRATOR || targetRole === ROLES.DEVELOPER) return false;
  if (targetRole === ROLES.GENERAL_MANAGER) {
    return Boolean(actor.id && target.id && actor.id === target.id);
  }
  return true;
}

export function canAssignMemberToDemand(actor, target) {
  if (!actor || !target) return false;
  const targetRole = resolveRoleCode(target);
  if (targetRole === ROLES.DEVELOPER) return false;
  if (
    targetRole === ROLES.ADMINISTRATOR ||
    targetRole === ROLES.GENERAL_MANAGER
  ) {
    return Boolean(actor.id && target.id && actor.id === target.id);
  }
  return true;
}

export function canSeeRecurringEvents(actor) {
  return hasScheduleManagementRole(actor);
}

export function canManageGeneralRecurringEvents(actor) {
  return isAdmin(actor);
}

export function canManageRecurringEvent(actor, event) {
  if (!actor || !event) return false;
  if (isAdmin(actor)) return true;
  if (resolveRoleCode(actor) !== ROLES.GENERAL_MANAGER) return false;
  if (event.isGlobal || event.isGeneral) return false;
  if (event.createdById) {
    return event.createdById === actor.id;
  }
  const eventDeptIds =
    Array.isArray(event.departmentIds) && event.departmentIds.length > 0
      ? event.departmentIds
      : event.departmentId
        ? [event.departmentId]
        : [];
  const actorDeptIds = getDepartmentIds(actor);
  return eventDeptIds.some((id) => actorDeptIds.includes(id));
}

export function canCreateRecurringEvent(actor, departments = []) {
  if (!actor) return false;
  if (isAdmin(actor)) return true;
  if (resolveRoleCode(actor) === ROLES.GENERAL_MANAGER) {
    return getAssignableDepartments(actor, departments).length > 0;
  }
  return false;
}

export function canPromoteRecurringEvent(actor, event) {
  return Boolean(
    actor &&
      event &&
      isAdmin(actor) &&
      !(event.isGlobal || event.isGeneral)
  );
}

export function canManageScheduleOf(actor, departmentId) {
  if (!actor || !departmentId) return false;
  if (isAdmin(actor)) return true;
  return (
    hasScheduleManagementRole(actor) &&
    getDepartmentIds(actor).includes(departmentId)
  );
}

export function canManageAnySchedule(actor, departments = []) {
  if (!actor) return false;
  return (
    isAdmin(actor) ||
    (hasScheduleManagementRole(actor) &&
      getAssignableDepartments(actor, departments).length > 0)
  );
}

export function canManageDemandsOf(actor, departmentId) {
  if (!actor || !departmentId) return false;
  if (isAdmin(actor)) return true;
  return (
    hasDemandManagementRole(actor) &&
    getDepartmentIds(actor).includes(departmentId)
  );
}

export function canCreateDemandsIn(actor, departmentId) {
  if (!actor || !departmentId) return false;
  if (isAdmin(actor)) return true;
  return getDepartmentIds(actor).includes(departmentId);
}

export function canEditDemand(actor, demand) {
  const departmentId = demand?.department?.id;
  if (!actor || !departmentId) return false;
  if (canManageDemandsOf(actor, departmentId)) return true;
  if (!getDepartmentIds(actor).includes(departmentId)) return false;
  const assignees = Array.isArray(demand.assignees) ? demand.assignees : [];
  return Boolean(
    (demand.createdBy?.id && demand.createdBy.id === actor.id) ||
      assignees.some((person) => person?.id === actor.id)
  );
}

export function canDeleteDemand(actor, demand) {
  const departmentId = demand?.department?.id;
  if (!actor || !departmentId) return false;
  if (canManageDemandsOf(actor, departmentId)) return true;
  if (!getDepartmentIds(actor).includes(departmentId)) return false;
  return Boolean(demand.createdBy?.id && demand.createdBy.id === actor.id);
}

export function canToggleDemandStatus(actor, demand, targetAssigneeIds) {
  const departmentId = demand?.department?.id;
  if (!actor || !departmentId) return false;
  if (canManageDemandsOf(actor, departmentId)) return true;
  if (!getDepartmentIds(actor).includes(departmentId)) return false;

  const currentAssigneeIds = Array.isArray(demand.assignees)
    ? demand.assignees.map((person) => person?.id).filter(Boolean)
    : [];
  const isCreator = Boolean(
    demand.createdBy?.id && demand.createdBy.id === actor.id
  );
  const isCurrentAssignee = currentAssigneeIds.includes(actor.id);
  if (!isCreator && !isCurrentAssignee) return false;

  const effectiveAssigneeIds =
    targetAssigneeIds === undefined
      ? currentAssigneeIds
      : Array.isArray(targetAssigneeIds)
        ? targetAssigneeIds.filter(Boolean)
        : [];

  if (
    effectiveAssigneeIds.length > 0 &&
    !effectiveAssigneeIds.includes(actor.id)
  ) {
    return false;
  }

  return true;
}

export function canManageAnyDemands(actor, departments = []) {
  if (!actor) return false;
  if (isAdmin(actor)) return true;
  return getAssignableDepartments(actor, departments).some(
    (dept) => dept?.hasDemands
  );
}

export function computeInitials(name) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "US";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function computeMinistryCode(name) {
  const cleaned = String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase().padEnd(2, "X");
  }
  return "MN";
}

export function normalizeUsername(rawValue) {
  return String(rawValue ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}

export function validateDisplayName(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "Informe o nome completo.";
  if (trimmed.length < 2) return "O nome deve ter pelo menos 2 caracteres.";
  if (trimmed.length > 80) return "O nome pode ter no máximo 80 caracteres.";
  return "";
}

export function validateUsername(value) {
  const normalized = normalizeUsername(value);
  if (!normalized) return "Informe um apelido.";
  if (!/^[a-z0-9_.]{3,15}$/.test(normalized)) {
    return "Use de 3 a 15 caracteres: letras, números, _ ou .";
  }
  return "";
}

export function formatCredentialForUi(apiCredential) {
  if (!apiCredential || typeof apiCredential !== "object") {
    return null;
  }

  const roleCode = resolveRoleCode(apiCredential) || ROLES.VOLUNTEER;
  const roleLabel = getRoleLabel(roleCode);
  const status = apiCredential.status || CREDENTIAL_STATUS.ACTIVE;
  const statusMeta =
    STATUS_META[status] || STATUS_META[CREDENTIAL_STATUS.ACTIVE];
  const departments = Array.isArray(apiCredential.departments)
    ? apiCredential.departments.filter((dept) => dept?.id && dept?.name)
    : [];
  const departmentIds = departments.map((dept) => dept.id);
  const username =
    typeof apiCredential.username === "string" && apiCredential.username.trim()
      ? apiCredential.username.trim()
      : null;

  return {
    id: apiCredential.id,
    name: apiCredential.name || "",
    initials: computeInitials(apiCredential.name),
    username,
    handle: username ? `@${username}` : "",
    role: roleLabel,
    roleCode,
    roleLabel,
    status,
    statusLabel: statusMeta.label,
    statusTone: statusMeta.tone,
    accessBadgeLabel: statusMeta.accessBadgeLabel,
    departments,
    departmentIds,
    ministries: departments.map((dept) => dept.name),
    pendingTransfer: apiCredential.pendingTransfer ?? null,
    availability: "Não informada",
    credentialNumber: apiCredential.credentialNumber ?? null,
  };
}

export async function copyTextToClipboard(text) {
  if (!text) return false;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below
    }
  }
  if (typeof document === "undefined") return false;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
  document.body.appendChild(textarea);
  textarea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  textarea.remove();
  return copied;
}
