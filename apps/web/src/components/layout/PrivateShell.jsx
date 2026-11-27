"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  CalendarIcon,
  ChartBarsIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  CloseIcon,
  LayersIcon,
  LogOutIcon,
  MenuIcon,
  SettingsIcon,
  SwapIcon,
  UserIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { CredentialCodeModal } from "@/components/ui/CredentialCodeModal";
import { RightDrawerEdgeHandle } from "@/components/ui/RightDrawerEdgeHandle";
import { useToast } from "@/components/ui/ToastProvider";
import { PrivateWorkspaceContext } from "./PrivateWorkspaceContext";
import { WorkspaceRightDrawerHost } from "./WorkspaceRightDrawerHost";
import {
  fetchMyCredential,
  logoutSession,
} from "@/features/auth/services/authService";
import {
  listCredentials,
  listDepartments,
} from "@/features/participants/services/credentialsService";
import { NotificationBell } from "@/features/notifications/components/NotificationBell";
import { useNotificationCenter } from "@/features/notifications/hooks/useNotificationCenter";
import {
  reconnectDevicePush,
  registerServiceWorker,
} from "@/features/notifications/lib/devicePush";
import { WelcomeOnboarding } from "@/features/onboarding/components/WelcomeOnboarding";
import {
  forgetWelcomeOnboarding,
  hasPendingWelcomeOnboarding,
} from "@/features/onboarding/lib/welcomeOnboarding";
import {
  ACTIVE_MINISTRY,
  CURRENT_USER,
} from "@/features/schedules/data/mockScheduleData";
import {
  formatRecurringEventForUi,
  listRecurringEvents,
} from "@/features/recurring-events/services/recurringEventsService";
import { fetchSystemConfig } from "@/features/settings/services/systemService";
import {
  subscribeMaintenance,
  subscribeUnauthorized,
} from "@/lib/apiClient";
import { dismissHiddenModalDialogs } from "@/lib/rightDrawer";
import {
  canListCredentials,
  canSeeRecurringEvents,
  computeInitials,
  computeMinistryCode,
  CREDENTIAL_STATUS,
  formatCredentialForUi,
  getDepartmentIds,
  isAdmin,
  isAtLeast,
  isDeveloper,
  ROLES,
} from "@/lib/roles";
import {
  clearStoredSession,
  getStoredSession,
  subscribeSessionChange,
} from "@/lib/sessionStorage";
import styles from "./PrivateShell.module.css";

const NAV_ITEMS = [
  {
    href: "/schedule",
    label: "Escala do mês",
    icon: CalendarIcon,
  },
  {
    href: "/agenda",
    label: "Agenda",
    icon: CalendarDaysIcon,
  },
  {
    href: "/demands",
    label: "Demandas",
    icon: ClipboardListIcon,
  },
  {
    href: "/participants",
    label: "Participantes",
    icon: UsersIcon,
  },
  {
    href: "/ministries",
    label: "Ministérios",
    icon: LayersIcon,
  },
  {
    href: "/recurring-events",
    label: "Eventos recorrentes",
    icon: SwapIcon,
  },
  {
    href: "/availability",
    label: "Disponibilidade",
    icon: CalendarCheckIcon,
  },
  {
    href: "/reports",
    label: "Relatórios",
    icon: ChartBarsIcon,
  },
];

const ACTIVE_MINISTRY_STORAGE_KEY = "midia_sbn_active_ministry_v1";
const WORKSPACE_SYNC_CHANNEL = "midia_sbn_workspace_sync_v1";
const WORKSPACE_POLL_INTERVAL_MS = 20 * 1000;
const WORKSPACE_SYNC_THROTTLE_MS = 2000;

function readSavedActiveMinistryId(userId) {
  if (typeof window === "undefined" || !userId) return "";
  try {
    const raw = window.localStorage.getItem(ACTIVE_MINISTRY_STORAGE_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    if (parsed?.userId === userId && typeof parsed?.ministryId === "string") {
      return parsed.ministryId;
    }
  } catch {
    // Ignore storage access failures
  }
  return "";
}

function saveActiveMinistryId(userId, ministryId) {
  if (typeof window === "undefined" || !userId || !ministryId) return;
  try {
    window.localStorage.setItem(
      ACTIVE_MINISTRY_STORAGE_KEY,
      JSON.stringify({ userId, ministryId })
    );
  } catch {
    // Ignore storage access failures
  }
}

function clearSavedActiveMinistryId() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACTIVE_MINISTRY_STORAGE_KEY);
  } catch {
    // Ignore storage access failures
  }
}

function mapDepartmentToMinistryUi(dept, index, allParticipants = []) {
  const deptMembers = allParticipants.filter(
    (person) =>
      person.status !== CREDENTIAL_STATUS.INACTIVE &&
      person.departmentIds?.includes(dept.id)
  );
  const generalManagers = deptMembers.filter(
    (person) => person.roleCode === ROLES.GENERAL_MANAGER
  );
  const hasGeneralManager = generalManagers.length > 0;
  const leaderHandle = hasGeneralManager
    ? generalManagers.map((gm) => gm.handle || gm.name).join(", ")
    : "Sem Líder Geral";

  return {
    id: dept.id,
    number: String(index + 1).padStart(2, "0"),
    code: computeMinistryCode(dept.name),
    name: dept.name,
    description: dept.description || "",
    hasDemands: Boolean(dept.hasDemands),
    participantCount:
      typeof dept.membersCount === "number"
        ? dept.membersCount
        : deptMembers.length,
    hasGeneralManager,
    generalManagers: generalManagers.map((gm) => ({
      id: gm.id,
      initials: gm.initials,
      name: gm.name,
      handle: gm.handle,
      departmentIds: gm.departmentIds,
    })),
    leaderHandle,
    members: deptMembers.slice(0, 6).map((member) => ({
      id: member.id,
      initials: member.initials,
      name: member.name,
    })),
  };
}

export { usePrivateWorkspace } from "./PrivateWorkspaceContext";

function SidebarContent({
  navItems,
  pathname,
  activeMinistry,
  canSwitchActiveMinistry = false,
  onNavigate,
  closeButton,
}) {
  const handleLinkClick = (event) => {
    if (event.detail > 0) {
      event.currentTarget.blur();
    }
    onNavigate?.();
  };

  const ministryCardBody = (
    <>
      <span className={styles.ministryBadge} aria-hidden="true">
        {activeMinistry.code}
      </span>
      <div className={styles.ministryMeta}>
        <span className={styles.ministryEyebrow}>
          {activeMinistry.isGlobal ? "VISÃO GLOBAL" : "MINISTÉRIO ATIVO"}
        </span>
        <span className={styles.ministryName}>{activeMinistry.name}</span>
      </div>
      {canSwitchActiveMinistry && (
        <SwapIcon className={styles.ministrySwitchIcon} aria-hidden="true" />
      )}
    </>
  );

  return (
    <div className={styles.sidebarInner}>
      <div className={styles.sidebarTop}>
        <div className={styles.brandRow}>
          <Link
            href="/schedule"
            className={styles.brandLink}
            onClick={handleLinkClick}
          >
            <Image
              src="/brand/logo-mark.svg"
              alt=""
              aria-hidden="true"
              width={36}
              height={36}
              priority
              className={styles.brandCompact}
            />
            <Image
              src="/brand/logo-midia-light.png"
              alt="Mídia Sobrenatural"
              width={684}
              height={302}
              priority
              className={styles.brandLogo}
            />
          </Link>
          {closeButton}
        </div>

        <p className={styles.navEyebrow}>NAVEGAÇÃO</p>

        <nav className={styles.navList} aria-label="Navegação principal">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/schedule" && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`${styles.navItem} ${
                  isActive ? styles.navItemActive : ""
                }`}
                onClick={handleLinkClick}
              >
                <Icon className={styles.navIcon} />
                <span className={styles.navLabel}>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {canSwitchActiveMinistry ? (
        <Link
          href="/ministries"
          className={`${styles.ministryCard} ${styles.ministryCardInteractive}`}
          title="Trocar ministério ativo"
          aria-label={`Ministério ativo: ${activeMinistry.name}. Ir para Ministérios para trocar`}
          onClick={handleLinkClick}
        >
          {ministryCardBody}
        </Link>
      ) : (
        <div className={styles.ministryCard}>{ministryCardBody}</div>
      )}
    </div>
  );
}

export function PrivateShell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const toast = useToast();
  const drawerId = useId();
  const profileMenuId = useId();

  const drawerDialogRef = useRef(null);
  const drawerScrollerRef = useRef(null);
  const drawerSheetRef = useRef(null);
  const profilePopoverRef = useRef(null);
  const drawerKeyRef = useRef(0);

  const authStatusRef = useRef("loading");
  const currentUserRef = useRef(CURRENT_USER);
  const departmentsRef = useRef([]);
  const participantsRef = useRef([]);
  const recurringEventsRef = useRef([]);
  const syncInFlightRef = useRef(null);
  const lastSyncAtRef = useRef(0);
  const lastPathnameRef = useRef(null);
  const broadcastChannelRef = useRef(null);
  const meReqIdRef = useRef(0);
  const deptReqIdRef = useRef(0);
  const partReqIdRef = useRef(0);
  const recReqIdRef = useRef(0);
  const meJsonRef = useRef("");
  const deptJsonRef = useRef("");
  const partJsonRef = useRef("");
  const recJsonRef = useRef("");

  const [authStatus, setAuthStatus] = useState("loading");
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [activeRightDrawer, setActiveRightDrawer] = useState(null);
  const [schedulesVersion, setSchedulesVersion] = useState(0);
  const [demandsVersion, setDemandsVersion] = useState(0);
  const [syncVersion, setSyncVersion] = useState(0);
  const [workspaceCodeModal, setWorkspaceCodeModal] = useState(null);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const [activeMinistry, setActiveMinistry] = useState(ACTIVE_MINISTRY);
  const [departments, setDepartments] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [isLoadingParticipants, setIsLoadingParticipants] = useState(false);
  const [participantsError, setParticipantsError] = useState("");
  const [participantCreatePreset, setParticipantCreatePreset] = useState(null);
  const [knownCredentialNumbers, setKnownCredentialNumbers] = useState({});
  const [currentUser, setCurrentUser] = useState(CURRENT_USER);
  const [recurringEvents, setRecurringEvents] = useState([]);
  const [isLoadingRecurringEvents, setIsLoadingRecurringEvents] = useState(false);
  const [recurringEventsError, setRecurringEventsError] = useState("");
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    authStatusRef.current = authStatus;
  }, [authStatus]);

  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  useEffect(() => {
    departmentsRef.current = departments;
  }, [departments]);

  useEffect(() => {
    participantsRef.current = participants;
  }, [participants]);

  useEffect(() => {
    recurringEventsRef.current = recurringEvents;
  }, [recurringEvents]);

  const isAuthenticated = authStatus === "authenticated";
  const notificationCenter = useNotificationCenter({ enabled: isAuthenticated });

  const rememberCredentialNumber = useCallback((id, code) => {
    if (!id || !code) return;
    setKnownCredentialNumbers((prev) => ({ ...prev, [id]: code }));
  }, []);

  const refreshDepartments = useCallback(async () => {
    const reqId = ++deptReqIdRef.current;
    const result = await listDepartments();
    if (reqId !== deptReqIdRef.current) return departmentsRef.current;
    if (result.ok && Array.isArray(result.data)) {
      const rawJson = JSON.stringify(result.data);
      if (rawJson !== deptJsonRef.current) {
        deptJsonRef.current = rawJson;
        departmentsRef.current = result.data;
        setDepartments(result.data);
      }
      return result.data;
    }
    return departmentsRef.current;
  }, []);

  const refreshParticipants = useCallback(
    async (userOverrideOrOptions, maybeOptions) => {
      const isOptionsObj =
        userOverrideOrOptions &&
        typeof userOverrideOrOptions === "object" &&
        ("silent" in userOverrideOrOptions ||
          Object.keys(userOverrideOrOptions).length === 0) &&
        !("role" in userOverrideOrOptions) &&
        !("roleCode" in userOverrideOrOptions) &&
        !("id" in userOverrideOrOptions);
      const userOverride = isOptionsObj ? undefined : userOverrideOrOptions;
      const options = isOptionsObj
        ? userOverrideOrOptions
        : maybeOptions || {};
      const silent = Boolean(options.silent);

      const actor = userOverride || currentUserRef.current;
      if (!canListCredentials(actor)) {
        partJsonRef.current = "";
        participantsRef.current = [];
        setParticipants([]);
        setParticipantsError("");
        setIsLoadingParticipants(false);
        return [];
      }

      const reqId = ++partReqIdRef.current;
      const hasLoaded = participantsRef.current.length > 0;
      if (!silent && !hasLoaded) {
        setIsLoadingParticipants(true);
      }
      if (!silent) {
        setParticipantsError("");
      }

      const result = await listCredentials();
      if (reqId !== partReqIdRef.current) return participantsRef.current;
      setIsLoadingParticipants(false);

      if (result.ok && Array.isArray(result.data)) {
        const rawJson = JSON.stringify(result.data);
        if (rawJson !== partJsonRef.current) {
          partJsonRef.current = rawJson;
          const mapped = result.data
            .map(formatCredentialForUi)
            .filter((item) => item && !isDeveloper(item));
          participantsRef.current = mapped;
          setParticipants(mapped);
          setParticipantsError("");
          return mapped;
        }
        setParticipantsError("");
        return participantsRef.current;
      }

      if (!silent && !hasLoaded) {
        setParticipantsError(
          result.error || "Não foi possível carregar os participantes."
        );
      }
      return participantsRef.current;
    },
    []
  );

  const refreshRecurringEvents = useCallback(
    async (userOverrideOrOptions, maybeOptions) => {
      const isOptionsObj =
        userOverrideOrOptions &&
        typeof userOverrideOrOptions === "object" &&
        ("silent" in userOverrideOrOptions ||
          Object.keys(userOverrideOrOptions).length === 0) &&
        !("role" in userOverrideOrOptions) &&
        !("roleCode" in userOverrideOrOptions) &&
        !("id" in userOverrideOrOptions);
      const userOverride = isOptionsObj ? undefined : userOverrideOrOptions;
      const options = isOptionsObj
        ? userOverrideOrOptions
        : maybeOptions || {};
      const silent = Boolean(options.silent);

      const actor = userOverride || currentUserRef.current;
      if (!canSeeRecurringEvents(actor)) {
        recJsonRef.current = "";
        recurringEventsRef.current = [];
        setRecurringEvents([]);
        setRecurringEventsError("");
        setIsLoadingRecurringEvents(false);
        return [];
      }

      const reqId = ++recReqIdRef.current;
      const hasLoaded = recurringEventsRef.current.length > 0;
      if (!silent && !hasLoaded) {
        setIsLoadingRecurringEvents(true);
      }
      if (!silent) {
        setRecurringEventsError("");
      }

      const result = await listRecurringEvents();
      if (reqId !== recReqIdRef.current) return recurringEventsRef.current;
      setIsLoadingRecurringEvents(false);

      if (result.ok && Array.isArray(result.data)) {
        const rawJson = JSON.stringify(result.data);
        if (rawJson !== recJsonRef.current) {
          recJsonRef.current = rawJson;
          const mapped = result.data
            .map(formatRecurringEventForUi)
            .filter(Boolean);
          recurringEventsRef.current = mapped;
          setRecurringEvents(mapped);
          setRecurringEventsError("");
          return mapped;
        }
        setRecurringEventsError("");
        return recurringEventsRef.current;
      }

      if (!silent && !hasLoaded) {
        setRecurringEventsError(
          result.error || "Não foi possível carregar os eventos recorrentes."
        );
      }
      return recurringEventsRef.current;
    },
    []
  );

  const refreshCurrentUser = useCallback(async () => {
    const reqId = ++meReqIdRef.current;
    const meResult = await fetchMyCredential();
    if (reqId !== meReqIdRef.current) return null;
    if (!meResult.ok || !meResult.data) {
      return null;
    }
    if (meResult.data.status !== CREDENTIAL_STATUS.ACTIVE) {
      clearSavedActiveMinistryId();
      clearStoredSession();
      authStatusRef.current = "redirecting";
      setAuthStatus("redirecting");
      router.replace("/");
      return null;
    }
    const rawJson = JSON.stringify(meResult.data);
    const formatted = formatCredentialForUi(meResult.data);
    if (rawJson !== meJsonRef.current && formatted) {
      meJsonRef.current = rawJson;
      currentUserRef.current = formatted;
      setCurrentUser(formatted);
    }
    return formatted || currentUserRef.current;
  }, [router]);

  useEffect(() => {
    let active = true;

    const session = getStoredSession();
    if (!session?.accessToken) {
      router.replace("/");
      return undefined;
    }

    async function bootstrapWorkspace() {
      const meResult = await fetchMyCredential();
      if (!active) return;

      if (!meResult.ok || !meResult.data) {
        clearStoredSession();
        setAuthStatus("redirecting");
        router.replace("/");
        return;
      }

      if (meResult.data.status !== CREDENTIAL_STATUS.ACTIVE) {
        setAuthStatus("redirecting");
        router.replace("/");
        return;
      }

      const formattedUser = formatCredentialForUi(meResult.data);
      meJsonRef.current = JSON.stringify(meResult.data);
      currentUserRef.current = formattedUser;
      setCurrentUser(formattedUser);

      const canList = canListCredentials(formattedUser);
      const canSeeRec = canSeeRecurringEvents(formattedUser);
      const devUser = isDeveloper(formattedUser);
      setIsLoadingParticipants(canList);
      setIsLoadingRecurringEvents(canSeeRec);

      const [deptRes, credsRes, recRes, sysConfigRes] = await Promise.all([
        listDepartments(),
        canList ? listCredentials() : Promise.resolve({ ok: true, data: [] }),
        canSeeRec
          ? listRecurringEvents()
          : Promise.resolve({ ok: true, data: [] }),
        devUser ? fetchSystemConfig() : Promise.resolve(null),
      ]);
      if (!active) return;

      if (devUser && sysConfigRes?.ok && sysConfigRes.data) {
        setMaintenanceMode(Boolean(sysConfigRes.data.maintenanceMode));
      }

      const loadedDepts =
        deptRes.ok && Array.isArray(deptRes.data) ? deptRes.data : [];
      deptJsonRef.current =
        deptRes.ok && Array.isArray(deptRes.data)
          ? JSON.stringify(deptRes.data)
          : "";
      departmentsRef.current = loadedDepts;
      setDepartments(loadedDepts);

      if (canList) {
        setIsLoadingParticipants(false);
        if (credsRes.ok && Array.isArray(credsRes.data)) {
          partJsonRef.current = JSON.stringify(credsRes.data);
          const mappedParticipants = credsRes.data
            .map(formatCredentialForUi)
            .filter((item) => item && !isDeveloper(item));
          participantsRef.current = mappedParticipants;
          setParticipants(mappedParticipants);
          setParticipantsError("");
        } else {
          setParticipantsError(
            credsRes.error || "Não foi possível carregar os participantes."
          );
        }
      }

      if (canSeeRec) {
        setIsLoadingRecurringEvents(false);
        if (recRes.ok && Array.isArray(recRes.data)) {
          recJsonRef.current = JSON.stringify(recRes.data);
          const mappedRecurring = recRes.data
            .map(formatRecurringEventForUi)
            .filter(Boolean);
          recurringEventsRef.current = mappedRecurring;
          setRecurringEvents(mappedRecurring);
          setRecurringEventsError("");
        } else {
          setRecurringEventsError(
            recRes.error || "Não foi possível carregar os eventos recorrentes."
          );
        }
      }

      if (isAdmin(formattedUser)) {
        setActiveMinistry({
          id: devUser ? "developer-global" : "admin-global",
          code: devUser ? "DV" : "AD",
          name: "Todos os ministérios",
          hasDemands: loadedDepts.some((dept) => Boolean(dept?.hasDemands)),
          isGlobal: true,
        });
      } else {
        const userDepts = formattedUser.departments || [];
        if (userDepts.length > 0) {
          const savedMinistryId = readSavedActiveMinistryId(formattedUser.id);
          const initialDept =
            userDepts.find((dept) => dept.id === savedMinistryId) ||
            userDepts[0];
          const fullDept =
            loadedDepts.find((dept) => dept.id === initialDept.id) || initialDept;
          setActiveMinistry({
            id: fullDept.id,
            code: computeMinistryCode(fullDept.name),
            name: fullDept.name,
            hasDemands: Boolean(fullDept.hasDemands),
            isGlobal: false,
          });
          saveActiveMinistryId(formattedUser.id, fullDept.id);
        } else if (loadedDepts.length > 0) {
          setActiveMinistry({
            id: loadedDepts[0].id,
            code: computeMinistryCode(loadedDepts[0].name),
            name: loadedDepts[0].name,
            hasDemands: Boolean(loadedDepts[0].hasDemands),
            isGlobal: false,
          });
        } else {
          setActiveMinistry(ACTIVE_MINISTRY);
        }
      }

      lastSyncAtRef.current = Date.now();
      authStatusRef.current = "authenticated";
      setAuthStatus("authenticated");
    }

    bootstrapWorkspace();

    const unsubUnauthorized = subscribeUnauthorized((reason) => {
      if (!active) return;
      clearSavedActiveMinistryId();
      setAuthStatus("redirecting");
      toast.error(reason || "Sessão encerrada. Faça login novamente.");
      router.replace("/");
    });

    const unsubMaintenance = subscribeMaintenance((reason) => {
      if (!active) return;
      clearSavedActiveMinistryId();
      setAuthStatus("redirecting");
      toast.error(reason || "O sistema entrou em modo de manutenção.");
      router.replace("/");
    });

    const unsubSession = subscribeSessionChange((nextSession) => {
      if (!active) return;
      if (!nextSession?.accessToken) {
        clearSavedActiveMinistryId();
        setAuthStatus("redirecting");
        router.replace("/");
        return;
      }
      if (nextSession.credential) {
        setCurrentUser((prev) => {
          const merged = {
            ...(prev?.departments && !nextSession.credential.departments
              ? { departments: prev.departments }
              : {}),
            ...nextSession.credential,
          };
          return formatCredentialForUi(merged) || prev;
        });
      }
    });

    return () => {
      active = false;
      unsubUnauthorized();
      unsubMaintenance();
      unsubSession();
    };
  }, [router, toast]);

  const ministries = useMemo(
    () =>
      departments.map((dept, index) =>
        mapDepartmentToMinistryUi(dept, index, participants)
      ),
    [departments, participants]
  );

  const addMinistry = useCallback((item) => {
    if (!item?.id) return;
    deptJsonRef.current = "";
    setDepartments((prev) => [...prev, item]);
  }, []);

  const addParticipant = useCallback((item) => {
    const formatted = item?.roleCode ? item : formatCredentialForUi(item);
    if (!formatted) return;
    partJsonRef.current = "";
    if (item?.credentialNumber) {
      rememberCredentialNumber(formatted.id, item.credentialNumber);
    }
    setParticipants((prev) => {
      const exists = prev.some((entry) => entry.id === formatted.id);
      const next = exists
        ? prev.map((entry) => (entry.id === formatted.id ? formatted : entry))
        : [...prev, formatted];
      return next.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    });
  }, [rememberCredentialNumber]);

  const updateParticipant = useCallback(
    (id, patch) => {
      partJsonRef.current = "";
      if (patch?.credentialNumber) {
        rememberCredentialNumber(id, patch.credentialNumber);
      }
      setParticipants((prev) =>
        prev.map((item) => {
          if (item.id !== id) return item;
          if (patch?.roleCode || patch?.status || Array.isArray(patch?.departments)) {
            const mergedRaw = {
              id: item.id,
              name: patch.name ?? item.name,
              username:
                patch.username !== undefined ? patch.username : item.username,
              role: patch.roleCode ?? item.roleCode,
              status: patch.status ?? item.status,
              departments: patch.departments ?? item.departments,
              pendingTransfer:
                patch.pendingTransfer !== undefined
                  ? patch.pendingTransfer
                  : item.pendingTransfer,
              credentialNumber:
                patch.credentialNumber !== undefined
                  ? patch.credentialNumber
                  : item.credentialNumber,
            };
            return formatCredentialForUi(mergedRaw) || item;
          }
          return { ...item, ...patch };
        })
      );
    },
    [rememberCredentialNumber]
  );

  const deleteParticipant = useCallback((id) => {
    partJsonRef.current = "";
    setParticipants((prev) => prev.filter((item) => item.id !== id));
    setKnownCredentialNumbers((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const addRecurringEvent = useCallback((item) => {
    const formatted = item?.weekdayCode
      ? item
      : formatRecurringEventForUi(item);
    if (!formatted) return;
    recJsonRef.current = "";
    setRecurringEvents((prev) => [...prev, formatted]);
  }, []);

  const deleteRecurringEvent = useCallback((id) => {
    recJsonRef.current = "";
    setRecurringEvents((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const updateCurrentUser = useCallback((patch) => {
    meJsonRef.current = "";
    setCurrentUser((prev) => {
      const nextName = patch.name ?? prev.name;
      const cleanUsername =
        patch.username !== undefined
          ? patch.username
          : patch.handle !== undefined
            ? String(patch.handle).replace(/^@+/, "")
            : prev.username;
      return {
        ...prev,
        ...patch,
        username: cleanUsername || null,
        handle: cleanUsername ? `@${cleanUsername}` : "",
        initials: computeInitials(nextName),
      };
    });
  }, []);

  const resolvedActiveMinistry = useMemo(() => {
    if (authStatus !== "authenticated") {
      return activeMinistry;
    }

    if (isAdmin(currentUser)) {
      const dev = isDeveloper(currentUser);
      return {
        id: dev ? "developer-global" : "admin-global",
        code: dev ? "DV" : "AD",
        name: "Todos os ministérios",
        hasDemands: departments.some((dept) => Boolean(dept?.hasDemands)),
        isGlobal: true,
      };
    }

    const userDepts = Array.isArray(currentUser.departments)
      ? currentUser.departments
      : [];
    const pool =
      userDepts.length > 0
        ? userDepts.map(
            (uDept) =>
              departments.find((dept) => dept.id === uDept.id) || uDept
          )
        : departments;

    if (pool.length === 0) {
      return activeMinistry;
    }

    const matched =
      (!activeMinistry?.isGlobal &&
        pool.find((dept) => dept.id === activeMinistry?.id)) ||
      pool[0];

    if (!matched) {
      return activeMinistry;
    }

    return {
      id: matched.id,
      code: computeMinistryCode(matched.name),
      name: matched.name,
      hasDemands: Boolean(matched.hasDemands),
      isGlobal: false,
    };
  }, [activeMinistry, authStatus, currentUser, departments]);

  const visibleNavItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (item.href === "/demands") {
          return (
            isAdmin(currentUser) || Boolean(resolvedActiveMinistry?.hasDemands)
          );
        }
        if (item.href === "/participants") {
          return canListCredentials(currentUser);
        }
        if (item.href === "/recurring-events") {
          return canSeeRecurringEvents(currentUser);
        }
        if (item.href === "/availability") {
          return !isAtLeast(currentUser, ROLES.GENERAL_MANAGER);
        }
        return true;
      }),
    [currentUser, resolvedActiveMinistry?.hasDemands]
  );

  const canSwitchActiveMinistry = useMemo(() => {
    if (isAdmin(currentUser)) return false;
    if (!resolvedActiveMinistry || resolvedActiveMinistry.isGlobal) {
      return false;
    }
    return getDepartmentIds(currentUser).length > 1;
  }, [currentUser, resolvedActiveMinistry]);

  useEffect(() => {
    if (
      authStatus === "authenticated" &&
      currentUser?.id &&
      !resolvedActiveMinistry?.isGlobal &&
      resolvedActiveMinistry?.id
    ) {
      saveActiveMinistryId(currentUser.id, resolvedActiveMinistry.id);
    }
  }, [
    authStatus,
    currentUser?.id,
    resolvedActiveMinistry?.id,
    resolvedActiveMinistry?.isGlobal,
  ]);

  const broadcastWorkspaceSync = useCallback(() => {
    if (
      typeof window === "undefined" ||
      typeof BroadcastChannel === "undefined"
    ) {
      return;
    }
    try {
      const channel =
        broadcastChannelRef.current ||
        new BroadcastChannel(WORKSPACE_SYNC_CHANNEL);
      broadcastChannelRef.current = channel;
      channel.postMessage({
        type: "workspace-mutated",
        at: Date.now(),
      });
    } catch {
      // Ignore BroadcastChannel errors
    }
  }, []);

  const syncWorkspaceData = useCallback(
    async ({ includeSchedules = false, force = false } = {}) => {
      if (authStatusRef.current !== "authenticated") return;
      const now = Date.now();
      if (!force && now - lastSyncAtRef.current < WORKSPACE_SYNC_THROTTLE_MS) {
        if (includeSchedules) {
          setSchedulesVersion((prev) => prev + 1);
          setSyncVersion((prev) => prev + 1);
        }
        return;
      }

      if (syncInFlightRef.current && !force) {
        await syncInFlightRef.current;
        if (includeSchedules) {
          setSchedulesVersion((prev) => prev + 1);
          setSyncVersion((prev) => prev + 1);
        }
        return;
      }

      const runSync = (async () => {
        lastSyncAtRef.current = Date.now();
        const updatedUser = await refreshCurrentUser();
        const actor = updatedUser || currentUserRef.current;
        if (!actor?.id || authStatusRef.current !== "authenticated") return;

        const devActor = isDeveloper(actor);
        const [, , , sysRes] = await Promise.all([
          refreshDepartments(),
          canListCredentials(actor)
            ? refreshParticipants(actor, { silent: true })
            : Promise.resolve([]),
          canSeeRecurringEvents(actor)
            ? refreshRecurringEvents(actor, { silent: true })
            : Promise.resolve([]),
          devActor ? fetchSystemConfig() : Promise.resolve(null),
        ]);
        if (devActor && sysRes?.ok && sysRes.data) {
          setMaintenanceMode(Boolean(sysRes.data.maintenanceMode));
        }

        lastSyncAtRef.current = Date.now();
        if (includeSchedules) {
          setSchedulesVersion((prev) => prev + 1);
        }
        setSyncVersion((prev) => prev + 1);
      })().finally(() => {
        if (syncInFlightRef.current === runSync) {
          syncInFlightRef.current = null;
        }
      });

      syncInFlightRef.current = runSync;
      await runSync;
    },
    [
      refreshCurrentUser,
      refreshDepartments,
      refreshParticipants,
      refreshRecurringEvents,
    ]
  );

  useEffect(() => {
    if (!isAuthenticated) {
      lastPathnameRef.current = null;
      return undefined;
    }

    if (lastPathnameRef.current === null) {
      lastPathnameRef.current = pathname;
      return undefined;
    }

    if (lastPathnameRef.current === pathname) {
      return undefined;
    }

    lastPathnameRef.current = pathname;
    const timer = window.setTimeout(() => {
      syncWorkspaceData({ force: true });
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isAuthenticated, pathname, syncWorkspaceData]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    let channel = null;
    if (typeof BroadcastChannel !== "undefined") {
      try {
        channel = new BroadcastChannel(WORKSPACE_SYNC_CHANNEL);
        broadcastChannelRef.current = channel;
        channel.onmessage = (event) => {
          if (event.data?.type === "workspace-mutated") {
            syncWorkspaceData({ includeSchedules: true, force: true });
          }
        };
      } catch {
        channel = null;
      }
    }

    const handleVisibleOrFocus = () => {
      if (document.visibilityState === "visible") {
        syncWorkspaceData({ includeSchedules: true });
      }
    };

    const handleOnline = () => {
      syncWorkspaceData({ includeSchedules: true, force: true });
    };

    const pollTimer = window.setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        navigator.onLine !== false
      ) {
        syncWorkspaceData({ includeSchedules: true });
      }
    }, WORKSPACE_POLL_INTERVAL_MS);

    document.addEventListener("visibilitychange", handleVisibleOrFocus);
    window.addEventListener("focus", handleVisibleOrFocus);
    window.addEventListener("online", handleOnline);

    return () => {
      window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", handleVisibleOrFocus);
      window.removeEventListener("focus", handleVisibleOrFocus);
      window.removeEventListener("online", handleOnline);
      if (channel) {
        channel.close();
        if (broadcastChannelRef.current === channel) {
          broadcastChannelRef.current = null;
        }
      }
    };
  }, [isAuthenticated, syncWorkspaceData]);

  const currentUserIsAdmin = isAdmin(currentUser);
  const deviceUserId = currentUser?.id || "";

  useEffect(() => {
    if (!isAuthenticated || !deviceUserId) return undefined;
    registerServiceWorker();
    if (!currentUserIsAdmin) reconnectDevicePush();

    if (!hasPendingWelcomeOnboarding(deviceUserId)) return undefined;
    const openWelcome = window.setTimeout(() => setIsWelcomeOpen(true), 300);
    return () => window.clearTimeout(openWelcome);
  }, [currentUserIsAdmin, deviceUserId, isAuthenticated]);

  const closeWelcome = useCallback(() => {
    forgetWelcomeOnboarding();
    setIsWelcomeOpen(false);
  }, []);

  const openWorkspaceDrawer = useCallback(
    (type, payload = {}) => {
      if (!type) return;
      drawerKeyRef.current += 1;
      setActiveRightDrawer({
        type,
        key: drawerKeyRef.current,
        payload,
      });
      syncWorkspaceData();
    },
    [syncWorkspaceData]
  );

  const closeWorkspaceDrawer = useCallback((instanceKey) => {
    setActiveRightDrawer((prev) => {
      if (!prev) return null;
      if (instanceKey !== undefined && prev.key !== instanceKey) return prev;
      return null;
    });
  }, []);

  const notifySchedulesChanged = useCallback(() => {
    setSchedulesVersion((prev) => prev + 1);
    setSyncVersion((prev) => prev + 1);
    broadcastWorkspaceSync();
  }, [broadcastWorkspaceSync]);

  const notifyDemandsChanged = useCallback(() => {
    setDemandsVersion((prev) => prev + 1);
    setSyncVersion((prev) => prev + 1);
    broadcastWorkspaceSync();
  }, [broadcastWorkspaceSync]);

  const openWorkspaceCodeModal = useCallback((modalState) => {
    setWorkspaceCodeModal(modalState || null);
  }, []);

  const closeWorkspaceCodeModal = useCallback(() => {
    setWorkspaceCodeModal(null);
  }, []);

  const currentUserId = currentUser?.id || "";
  const selectActiveMinistry = useCallback(
    (nextMinistry) => {
      if (!nextMinistry) return;
      setActiveMinistry(nextMinistry);
      if (!nextMinistry.isGlobal && nextMinistry.id && currentUserId) {
        saveActiveMinistryId(currentUserId, nextMinistry.id);
      }
    },
    [currentUserId]
  );

  const handleSignOut = async () => {
    closeWorkspaceDrawer();
    profilePopoverRef.current?.hidePopover?.();
    clearSavedActiveMinistryId();
    setAuthStatus("redirecting");
    await logoutSession();
    toast.success("Você saiu da sua conta.");
    router.replace("/");
  };

  const closeDrawer = useCallback(() => {
    const dialog = drawerDialogRef.current;
    const scroller = drawerScrollerRef.current;
    if (!dialog || !dialog.open) return;

    if (scroller) {
      scroller.scrollTo({ left: scroller.offsetWidth, behavior: "auto" });
    } else {
      dialog.close();
      setIsDrawerExpanded(false);
    }
  }, []);

  const openDrawer = useCallback(async () => {
    const dialog = drawerDialogRef.current;
    const scroller = drawerScrollerRef.current;
    if (!dialog || !scroller) return;

    if (!dialog.open) {
      dialog.showModal();
    }

    if (!CSS.supports("scroll-initial-target", "nearest")) {
      scroller.scrollTo({ left: scroller.offsetWidth, behavior: "instant" });
      await new Promise((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
      });
    }

    scroller.scrollTo({ left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const dialog = drawerDialogRef.current;
    const scroller = drawerScrollerRef.current;
    const sheet = drawerSheetRef.current;
    if (!dialog || !scroller || !sheet) return undefined;

    const visibleThreshold = 1 / Math.max(1, window.innerWidth);
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (!entry || !dialog.open) return;

        if (entry.intersectionRatio < visibleThreshold) {
          dialog.close();
          setIsDrawerExpanded(false);
        } else if (entry.intersectionRatio >= 0.99) {
          setIsDrawerExpanded(true);
        }
      },
      { root: dialog, threshold: [visibleThreshold, 1] }
    );

    observer.observe(sheet);

    let removeScrollFallback = null;
    if (!CSS.supports("animation-timeline: scroll()")) {
      const handleScroll = () => {
        const sheetWidth = Math.max(1, sheet.offsetWidth);
        const ratio = Math.max(
          0,
          Math.min(1, 1 - scroller.scrollLeft / sheetWidth)
        );
        dialog.style.setProperty("--drawer-backdrop", String(ratio));
      };
      scroller.addEventListener("scroll", handleScroll, { passive: true });
      removeScrollFallback = () =>
        scroller.removeEventListener("scroll", handleScroll);
    }

    return () => {
      observer.disconnect();
      if (removeScrollFallback) removeScrollFallback();
    };
  }, [authStatus]);

  useEffect(() => {
    dismissHiddenModalDialogs();
    const rafId = window.requestAnimationFrame(() => {
      dismissHiddenModalDialogs();
    });
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [pathname]);

  const handleDrawerBackdropClick = (event) => {
    const sheet = drawerSheetRef.current;
    if (sheet && !sheet.contains(event.target)) {
      closeDrawer();
    }
  };

  const handleDrawerCancel = (event) => {
    if (event.cancelable) {
      event.preventDefault();
      closeDrawer();
    } else {
      setIsDrawerExpanded(false);
    }
  };

  if (authStatus !== "authenticated") {
    return (
      <div className={styles.authGateShell} role="status" aria-live="polite">
        <p className={styles.authGateText}>
          {authStatus === "redirecting"
            ? "Redirecionando para o acesso..."
            : "Validando credencial..."}
        </p>
      </div>
    );
  }

  return (
    <PrivateWorkspaceContext.Provider
      value={{
        unreadCount: notificationCenter.unreadCount,
        markNotificationRead: notificationCenter.markRead,
        markAllNotificationsRead: notificationCenter.markAllRead,
        activeMinistry: resolvedActiveMinistry,
        setActiveMinistry: selectActiveMinistry,
        ministries,
        departments,
        refreshDepartments,
        addMinistry,
        participants,
        isLoadingParticipants,
        participantsError,
        refreshParticipants,
        addParticipant,
        updateParticipant,
        deleteParticipant,
        participantCreatePreset,
        setParticipantCreatePreset,
        knownCredentialNumbers,
        rememberCredentialNumber,
        currentUser,
        refreshCurrentUser,
        updateCurrentUser,
        recurringEvents,
        isLoadingRecurringEvents,
        recurringEventsError,
        refreshRecurringEvents,
        addRecurringEvent,
        deleteRecurringEvent,
        openWorkspaceDrawer,
        closeWorkspaceDrawer,
        schedulesVersion,
        notifySchedulesChanged,
        demandsVersion,
        notifyDemandsChanged,
        syncVersion,
        syncWorkspaceData,
        broadcastWorkspaceSync,
        openWorkspaceCodeModal,
        maintenanceMode,
        setMaintenanceMode,
      }}
    >
      <div className={styles.workspace}>
        <aside className={styles.desktopSidebar}>
          <SidebarContent
            navItems={visibleNavItems}
            pathname={pathname}
            activeMinistry={resolvedActiveMinistry}
            canSwitchActiveMinistry={canSwitchActiveMinistry}
          />
        </aside>

        <dialog
          ref={drawerDialogRef}
          id={drawerId}
          aria-label="Navegação principal"
          className={styles.drawerDialog}
          onClick={handleDrawerBackdropClick}
          onCancel={handleDrawerCancel}
          onClose={() => setIsDrawerExpanded(false)}
        >
          <div ref={drawerScrollerRef} className={styles.drawerScroller}>
            <div ref={drawerSheetRef} className={styles.drawerSheet}>
              <SidebarContent
                navItems={visibleNavItems}
                pathname={pathname}
                activeMinistry={resolvedActiveMinistry}
                canSwitchActiveMinistry={canSwitchActiveMinistry}
                onNavigate={closeDrawer}
                closeButton={
                  <button
                    type="button"
                    aria-label="Fechar menu"
                    className={styles.drawerCloseButton}
                    autoFocus
                    onClick={closeDrawer}
                  >
                    <CloseIcon />
                  </button>
                }
              />
            </div>
          </div>
        </dialog>

        <div className={styles.mainColumn}>
          <header className={styles.topbar}>
            <div className={styles.topbarLeft}>
              <button
                type="button"
                aria-label="Abrir navegação"
                aria-expanded={isDrawerExpanded}
                aria-controls={drawerId}
                className={styles.mobileMenuButton}
                onClick={openDrawer}
              >
                <MenuIcon />
              </button>
              <Link href="/schedule" className={styles.mobileBrandLink}>
                <Image
                  src="/brand/logo-midia-dark.png"
                  alt="Mídia Sobrenatural"
                  width={684}
                  height={302}
                  className={`${styles.mobileBrandLogo} ${styles.mobileBrandLogoLight}`}
                />
                <Image
                  src="/brand/logo-midia-light.png"
                  alt="Mídia Sobrenatural"
                  width={684}
                  height={302}
                  className={`${styles.mobileBrandLogo} ${styles.mobileBrandLogoDark}`}
                />
              </Link>
            </div>

            <div className={styles.topbarRight}>
              <NotificationBell center={notificationCenter} />

              <button
                type="button"
                popoverTarget={profileMenuId}
                className={styles.profileButton}
              >
                <span className={styles.profileAvatar} aria-hidden="true">
                  {currentUser.initials}
                </span>
                <span className={styles.profileInfo}>
                  <span className={styles.profileName}>
                    {currentUser.name}
                  </span>
                  <span className={styles.profileRole}>
                    {currentUser.roleLabel}
                  </span>
                </span>
                <ChevronDownIcon className={styles.profileChevron} />
              </button>

              <div
                ref={profilePopoverRef}
                id={profileMenuId}
                popover="auto"
                className={`${styles.popoverPanel} ${styles.profilePopover}`}
              >
                <div className={styles.profileSummary}>
                  <span className={styles.popoverAvatar} aria-hidden="true">
                    {currentUser.initials}
                  </span>
                  <div className={styles.profileSummaryText}>
                    <p className={styles.profileSummaryName}>
                      {currentUser.name}
                    </p>
                    <p className={styles.profileSummaryRole}>
                      {currentUser.roleLabel}
                    </p>
                    <p className={styles.profileSummaryMeta}>
                      {currentUser.ministries?.length > 0
                        ? currentUser.ministries.join(", ")
                        : isDeveloper(currentUser)
                          ? "Acesso Global"
                          : "Administração Geral"}
                    </p>
                  </div>
                </div>

                <div className={styles.profileMenuGroup}>
                  <Link
                    href="/profile"
                    className={styles.profileMenuItem}
                    onClick={() => profilePopoverRef.current?.hidePopover?.()}
                  >
                    <UserIcon />
                    <span>Meu perfil</span>
                  </Link>
                  {isDeveloper(currentUser) && (
                    <Link
                      href="/settings"
                      className={styles.profileMenuItem}
                      onClick={() => profilePopoverRef.current?.hidePopover?.()}
                    >
                      <SettingsIcon />
                      <span>Configurações</span>
                    </Link>
                  )}
                </div>

                <div className={styles.profileMenuDivider} aria-hidden="true" />

                <div className={styles.profileMenuGroup}>
                  <button
                    type="button"
                    className={styles.signOutItem}
                    onClick={handleSignOut}
                  >
                    <LogOutIcon />
                    <span>Sair</span>
                  </button>
                </div>
              </div>
            </div>
          </header>

          {isDeveloper(currentUser) && maintenanceMode && (
            <div className={styles.maintenanceNotice} role="status">
              <div className={styles.maintenanceNoticeInner}>
                <span className={styles.maintenanceNoticeIcon} aria-hidden="true">
                  <AlertTriangleIcon />
                </span>
                <p className={styles.maintenanceNoticeText}>
                  <strong>Modo de manutenção ativo.</strong> O login e o acesso
                  estão bloqueados para todos os demais usuários.
                </p>
                {pathname !== "/settings" && (
                  <Link href="/settings" className={styles.maintenanceNoticeLink}>
                    Gerenciar em Configurações
                  </Link>
                )}
              </div>
            </div>
          )}

          <main className={styles.content}>{children}</main>
        </div>
      </div>
      <WorkspaceRightDrawerHost
        activeDrawer={activeRightDrawer}
        onCloseDrawer={closeWorkspaceDrawer}
      />
      <RightDrawerEdgeHandle />
      <CredentialCodeModal
        modalState={workspaceCodeModal}
        onClose={closeWorkspaceCodeModal}
      />
      {isWelcomeOpen && (
        <WelcomeOnboarding user={currentUser} onFinish={closeWelcome} />
      )}
    </PrivateWorkspaceContext.Provider>
  );
}
