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
  CalendarCheckIcon,
  CalendarIcon,
  ChartBarsIcon,
  ChevronDownIcon,
  CloseIcon,
  LayersIcon,
  LogOutIcon,
  MenuIcon,
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
import { subscribeUnauthorized } from "@/lib/apiClient";
import { dismissHiddenModalDialogs } from "@/lib/rightDrawer";
import {
  canListCredentials,
  canSeeRecurringEvents,
  computeInitials,
  computeMinistryCode,
  CREDENTIAL_STATUS,
  formatCredentialForUi,
  isAdmin,
  isAtLeast,
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
  onNavigate,
  closeButton,
}) {
  const handleLinkClick = (event) => {
    if (event.detail > 0) {
      event.currentTarget.blur();
    }
    onNavigate?.();
  };

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

      <div className={styles.ministryCard}>
        <span className={styles.ministryBadge} aria-hidden="true">
          {activeMinistry.code}
        </span>
        <div className={styles.ministryMeta}>
          <span className={styles.ministryEyebrow}>
            {activeMinistry.isGlobal ? "VISÃO GLOBAL" : "MINISTÉRIO ATIVO"}
          </span>
          <span className={styles.ministryName}>{activeMinistry.name}</span>
        </div>
      </div>
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

  const [authStatus, setAuthStatus] = useState("loading");
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [activeRightDrawer, setActiveRightDrawer] = useState(null);
  const [schedulesVersion, setSchedulesVersion] = useState(0);
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

  const isAuthenticated = authStatus === "authenticated";
  const notificationCenter = useNotificationCenter({ enabled: isAuthenticated });

  const rememberCredentialNumber = useCallback((id, code) => {
    if (!id || !code) return;
    setKnownCredentialNumbers((prev) => ({ ...prev, [id]: code }));
  }, []);

  const refreshDepartments = useCallback(async () => {
    const result = await listDepartments();
    if (result.ok && Array.isArray(result.data)) {
      setDepartments(result.data);
      return result.data;
    }
    return [];
  }, []);

  const refreshParticipants = useCallback(async (userOverride) => {
    const actor = userOverride || currentUser;
    if (!canListCredentials(actor)) {
      setParticipants([]);
      setParticipantsError("");
      setIsLoadingParticipants(false);
      return [];
    }

    setIsLoadingParticipants(true);
    setParticipantsError("");
    const result = await listCredentials();
    setIsLoadingParticipants(false);

    if (result.ok && Array.isArray(result.data)) {
      const mapped = result.data.map(formatCredentialForUi).filter(Boolean);
      setParticipants(mapped);
      return mapped;
    }

    setParticipantsError(
      result.error || "Não foi possível carregar os participantes."
    );
    return [];
  }, [currentUser]);

  const refreshRecurringEvents = useCallback(async (userOverride) => {
    const actor = userOverride || currentUser;
    if (!canSeeRecurringEvents(actor)) {
      setRecurringEvents([]);
      setRecurringEventsError("");
      setIsLoadingRecurringEvents(false);
      return [];
    }

    setIsLoadingRecurringEvents(true);
    setRecurringEventsError("");
    const result = await listRecurringEvents();
    setIsLoadingRecurringEvents(false);

    if (result.ok && Array.isArray(result.data)) {
      const mapped = result.data.map(formatRecurringEventForUi).filter(Boolean);
      setRecurringEvents(mapped);
      return mapped;
    }

    setRecurringEventsError(
      result.error || "Não foi possível carregar os eventos recorrentes."
    );
    return [];
  }, [currentUser]);

  const refreshCurrentUser = useCallback(async () => {
    const meResult = await fetchMyCredential();
    if (!meResult.ok || !meResult.data) {
      return null;
    }
    const formatted = formatCredentialForUi(meResult.data);
    if (formatted) {
      setCurrentUser(formatted);
    }
    return formatted;
  }, []);

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
      setCurrentUser(formattedUser);

      const canList = canListCredentials(formattedUser);
      const canSeeRec = canSeeRecurringEvents(formattedUser);
      setIsLoadingParticipants(canList);
      setIsLoadingRecurringEvents(canSeeRec);

      const [deptRes, credsRes, recRes] = await Promise.all([
        listDepartments(),
        canList ? listCredentials() : Promise.resolve({ ok: true, data: [] }),
        canSeeRec
          ? listRecurringEvents()
          : Promise.resolve({ ok: true, data: [] }),
      ]);
      if (!active) return;

      const loadedDepts =
        deptRes.ok && Array.isArray(deptRes.data) ? deptRes.data : [];
      setDepartments(loadedDepts);

      if (canList) {
        setIsLoadingParticipants(false);
        if (credsRes.ok && Array.isArray(credsRes.data)) {
          setParticipants(
            credsRes.data.map(formatCredentialForUi).filter(Boolean)
          );
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
          setRecurringEvents(
            recRes.data.map(formatRecurringEventForUi).filter(Boolean)
          );
          setRecurringEventsError("");
        } else {
          setRecurringEventsError(
            recRes.error || "Não foi possível carregar os eventos recorrentes."
          );
        }
      }

      if (isAdmin(formattedUser)) {
        setActiveMinistry({
          id: "admin-global",
          code: "AD",
          name: "Todos os ministérios",
          isGlobal: true,
        });
      } else {
        const userDepts = formattedUser.departments || [];
        if (userDepts.length > 0) {
          const savedMinistryId = readSavedActiveMinistryId(formattedUser.id);
          const initialDept =
            userDepts.find((dept) => dept.id === savedMinistryId) ||
            userDepts[0];
          setActiveMinistry({
            id: initialDept.id,
            code: computeMinistryCode(initialDept.name),
            name: initialDept.name,
            isGlobal: false,
          });
          saveActiveMinistryId(formattedUser.id, initialDept.id);
        } else if (loadedDepts.length > 0) {
          setActiveMinistry({
            id: loadedDepts[0].id,
            code: computeMinistryCode(loadedDepts[0].name),
            name: loadedDepts[0].name,
            isGlobal: false,
          });
        } else {
          setActiveMinistry(ACTIVE_MINISTRY);
        }
      }

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

  const visibleNavItems = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
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
    [currentUser]
  );

  const addMinistry = useCallback((item) => {
    if (!item?.id) return;
    setDepartments((prev) => [...prev, item]);
  }, []);

  const addParticipant = useCallback((item) => {
    const formatted = item?.roleCode ? item : formatCredentialForUi(item);
    if (!formatted) return;
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
    setRecurringEvents((prev) => [...prev, formatted]);
  }, []);

  const deleteRecurringEvent = useCallback((id) => {
    setRecurringEvents((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const updateCurrentUser = useCallback((patch) => {
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

  const openWorkspaceDrawer = useCallback((type, payload = {}) => {
    if (!type) return;
    drawerKeyRef.current += 1;
    setActiveRightDrawer({
      type,
      key: drawerKeyRef.current,
      payload,
    });
  }, []);

  const closeWorkspaceDrawer = useCallback((instanceKey) => {
    setActiveRightDrawer((prev) => {
      if (!prev) return null;
      if (instanceKey !== undefined && prev.key !== instanceKey) return prev;
      return null;
    });
  }, []);

  const notifySchedulesChanged = useCallback(() => {
    setSchedulesVersion((prev) => prev + 1);
  }, []);

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
        activeMinistry,
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
        openWorkspaceCodeModal,
      }}
    >
      <div className={styles.workspace}>
        <aside className={styles.desktopSidebar}>
          <SidebarContent
            navItems={visibleNavItems}
            pathname={pathname}
            activeMinistry={activeMinistry}
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
                activeMinistry={activeMinistry}
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
                  className={styles.mobileBrandLogo}
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
