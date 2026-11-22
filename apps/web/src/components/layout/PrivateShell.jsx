"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellIcon,
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
import {
  ACTIVE_MINISTRY,
  CURRENT_USER,
  INITIAL_SUBSTITUTION_REQUEST,
} from "@/features/schedules/data/mockScheduleData";
import { MINISTRIES } from "@/features/ministries/data/mockMinistriesData";
import { PARTICIPANTS } from "@/features/participants/data/mockParticipantsData";
import { INITIAL_RECURRING_EVENTS } from "@/features/recurring-events/data/mockRecurringEventsData";
import styles from "./PrivateShell.module.css";

function computeInitials(name) {
  const parts = String(name ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "US";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

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
    href: "/reports",
    label: "Relatórios",
    icon: ChartBarsIcon,
  },
  {
    href: "/availability",
    label: "Disponibilidade",
    icon: CalendarCheckIcon,
  },
];

const INITIAL_NOTIFICATIONS = [
  {
    id: INITIAL_SUBSTITUTION_REQUEST.id,
    title: "Substituição sugerida",
    description: `${INITIAL_SUBSTITUTION_REQUEST.requesterHandle} indicou você para ${INITIAL_SUBSTITUTION_REQUEST.eventTitle} (${INITIAL_SUBSTITUTION_REQUEST.dateTimeLabel}).`,
    read: false,
  },
];

const PrivateWorkspaceContext = createContext({
  unreadCount: 0,
  markNotificationRead: () => {},
  markAllNotificationsRead: () => {},
  activeMinistry: ACTIVE_MINISTRY,
  setActiveMinistry: () => {},
  ministries: MINISTRIES,
  addMinistry: () => {},
  participants: PARTICIPANTS,
  addParticipant: () => {},
  updateParticipant: () => {},
  deleteParticipant: () => {},
  currentUser: CURRENT_USER,
  updateCurrentUser: () => {},
  recurringEvents: INITIAL_RECURRING_EVENTS,
  addRecurringEvent: () => {},
  deleteRecurringEvent: () => {},
});

export function usePrivateWorkspace() {
  return useContext(PrivateWorkspaceContext);
}

function SidebarContent({ pathname, activeMinistry, onNavigate, closeButton }) {
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
            <span className={styles.brandCompact} aria-hidden="true">
              M
            </span>
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
          {NAV_ITEMS.map((item) => {
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
          <span className={styles.ministryEyebrow}>MINISTÉRIO ATIVO</span>
          <span className={styles.ministryName}>{activeMinistry.name}</span>
        </div>
      </div>
    </div>
  );
}

export function PrivateShell({ children }) {
  const pathname = usePathname();
  const drawerId = useId();
  const notificationsId = useId();
  const profileMenuId = useId();

  const drawerDialogRef = useRef(null);
  const drawerScrollerRef = useRef(null);
  const drawerSheetRef = useRef(null);
  const notificationsPopoverRef = useRef(null);
  const profilePopoverRef = useRef(null);

  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);
  const [activeMinistry, setActiveMinistry] = useState(ACTIVE_MINISTRY);
  const [ministries, setMinistries] = useState(MINISTRIES);
  const [participants, setParticipants] = useState(PARTICIPANTS);
  const [currentUser, setCurrentUser] = useState(CURRENT_USER);
  const [recurringEvents, setRecurringEvents] = useState(
    INITIAL_RECURRING_EVENTS
  );

  const unreadCount = notifications.filter((item) => !item.read).length;

  const addMinistry = useCallback((item) => {
    setMinistries((prev) => [...prev, item]);
  }, []);

  const addParticipant = useCallback((item) => {
    setParticipants((prev) => [...prev, item]);
  }, []);

  const updateParticipant = useCallback((id, patch) => {
    setParticipants((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  }, []);

  const deleteParticipant = useCallback((id) => {
    setParticipants((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const addRecurringEvent = useCallback((item) => {
    setRecurringEvents((prev) => [...prev, item]);
  }, []);

  const deleteRecurringEvent = useCallback((id) => {
    setRecurringEvents((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const updateCurrentUser = useCallback((patch) => {
    setCurrentUser((prev) => {
      const nextName = patch.name ?? prev.name;
      return {
        ...prev,
        ...patch,
        initials: computeInitials(nextName),
      };
    });
  }, []);

  const markNotificationRead = useCallback((id) => {
    setNotifications((prev) =>
      prev.map((item) => (item.id === id ? { ...item, read: true } : item))
    );
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  }, []);

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
  }, []);

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

  return (
    <PrivateWorkspaceContext.Provider
      value={{
        unreadCount,
        markNotificationRead,
        markAllNotificationsRead,
        activeMinistry,
        setActiveMinistry,
        ministries,
        addMinistry,
        participants,
        addParticipant,
        updateParticipant,
        deleteParticipant,
        currentUser,
        updateCurrentUser,
        recurringEvents,
        addRecurringEvent,
        deleteRecurringEvent,
      }}
    >
      <div className={styles.workspace}>
        <aside className={styles.desktopSidebar}>
          <SidebarContent pathname={pathname} activeMinistry={activeMinistry} />
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
              <button
                type="button"
                popoverTarget={notificationsId}
                aria-label={
                  unreadCount > 0
                    ? `Notificações (${unreadCount} não lida${unreadCount > 1 ? "s" : ""})`
                    : "Notificações"
                }
                className={styles.bellButton}
              >
                <BellIcon />
                {unreadCount > 0 && (
                  <span className={styles.bellBadge} aria-hidden="true">
                    {unreadCount}
                  </span>
                )}
              </button>

              <div
                ref={notificationsPopoverRef}
                id={notificationsId}
                popover="auto"
                className={styles.popoverPanel}
              >
                <div className={styles.popoverHeader}>
                  <span className={styles.popoverTitle}>Notificações</span>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      className={styles.popoverTextAction}
                      onClick={markAllNotificationsRead}
                    >
                      Marcar como lidas
                    </button>
                  )}
                </div>

                <ul className={styles.notificationList}>
                  {notifications.map((item) => (
                    <li
                      key={item.id}
                      className={`${styles.notificationItem} ${
                        !item.read ? styles.notificationUnread : ""
                      }`}
                    >
                      <p className={styles.notificationTitle}>{item.title}</p>
                      <p className={styles.notificationDesc}>
                        {item.description}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>

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
                      {currentUser.ministries.join(", ")}
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
                  <Link
                    href="/"
                    className={styles.signOutItem}
                    onClick={() => profilePopoverRef.current?.hidePopover?.()}
                  >
                    <LogOutIcon />
                    <span>Sair</span>
                  </Link>
                </div>
              </div>
            </div>
          </header>

          <main className={styles.content}>{children}</main>
        </div>
      </div>
    </PrivateWorkspaceContext.Provider>
  );
}
