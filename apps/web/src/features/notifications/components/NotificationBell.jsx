"use client";

import { useId, useRef } from "react";
import { useRouter } from "next/navigation";
import { BellIcon, CloseIcon } from "@/components/ui/icons";
import styles from "./NotificationBell.module.css";

const relativeTime = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });

const TIME_STEPS = [
  { unit: "minute", seconds: 60, limit: 60 },
  { unit: "hour", seconds: 3600, limit: 24 },
  { unit: "day", seconds: 86400, limit: 7 },
  { unit: "week", seconds: 604800, limit: Infinity },
];

function formatWhen(isoDate) {
  const elapsedSeconds = (Date.now() - new Date(isoDate).getTime()) / 1000;
  if (elapsedSeconds < 60) return "agora";
  const step = TIME_STEPS.find(
    ({ seconds, limit }) => elapsedSeconds / seconds < limit
  );
  return relativeTime.format(
    -Math.floor(elapsedSeconds / step.seconds),
    step.unit
  );
}

function badgeLabel(count) {
  return count > 9 ? "9+" : String(count);
}

export function NotificationBell({ center }) {
  const router = useRouter();
  const popoverId = useId();
  const popoverRef = useRef(null);
  const { items, unreadCount, hasMore, status } = center;

  const handleOpen = (notification) => {
    center.markRead(notification.id);
    popoverRef.current?.hidePopover?.();
    if (notification.link) router.push(notification.link);
  };

  return (
    <>
      <button
        type="button"
        popoverTarget={popoverId}
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
            {badgeLabel(unreadCount)}
          </span>
        )}
      </button>

      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        className={styles.popoverPanel}
      >
        <div className={styles.popoverHeader}>
          <span className={styles.popoverTitle}>Notificações</span>
          {unreadCount > 0 && (
            <button
              type="button"
              className={styles.popoverTextAction}
              onClick={center.markAllRead}
            >
              Marcar como lidas
            </button>
          )}
        </div>

        {status === "loading" && items.length === 0 ? (
          <p className={styles.emptyState} role="status">
            Carregando notificações...
          </p>
        ) : status === "error" && items.length === 0 ? (
          <div className={styles.emptyState}>
            <p>Não foi possível carregar as notificações.</p>
            <button
              type="button"
              className={styles.popoverTextAction}
              onClick={center.refresh}
            >
              Tentar novamente
            </button>
          </div>
        ) : items.length === 0 ? (
          <p className={styles.emptyState}>Nenhuma notificação por aqui.</p>
        ) : (
          <ul className={styles.notificationList}>
            {items.map((notification) => (
              <li
                key={notification.id}
                className={`${styles.notificationItem} ${
                  notification.readAt ? "" : styles.notificationUnread
                }`}
              >
                <button
                  type="button"
                  className={styles.notificationOpen}
                  onClick={() => handleOpen(notification)}
                >
                  <span className={styles.notificationTitle}>
                    {!notification.readAt && (
                      <span className={styles.unreadDot} aria-hidden="true" />
                    )}
                    {notification.title}
                    {!notification.readAt && (
                      <span className="visually-hidden"> (não lida)</span>
                    )}
                  </span>
                  <span className={styles.notificationDesc}>
                    {notification.body}
                  </span>
                  <time
                    dateTime={notification.createdAt}
                    className={styles.notificationTime}
                  >
                    {formatWhen(notification.createdAt)}
                  </time>
                </button>
                <button
                  type="button"
                  aria-label={`Apagar notificação: ${notification.title}`}
                  className={styles.dismissButton}
                  onClick={() => center.remove(notification.id)}
                >
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ul>
        )}

        {(hasMore || items.length > 0) && (
          <div className={styles.popoverFooter}>
            {hasMore ? (
              <button
                type="button"
                className={styles.popoverTextAction}
                onClick={center.loadMore}
              >
                Carregar mais
              </button>
            ) : (
              <span />
            )}
            {items.length > 0 && (
              <button
                type="button"
                className={styles.popoverTextAction}
                onClick={center.clearAll}
              >
                Limpar todas
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
