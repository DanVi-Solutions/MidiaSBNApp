"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  NOTIFICATION_OPENED_MESSAGE,
  NOTIFICATION_RECEIVED_MESSAGE,
} from "@/features/notifications/lib/devicePush";
import {
  clearNotifications,
  deleteNotification,
  getUnreadNotificationCount,
  listNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/features/notifications/services/notificationsService";

const PAGE_SIZE = 20;
const POLL_INTERVAL = 60 * 1000;

const isUnreadIn = (items, id) =>
  items.some((item) => item.id === id && !item.readAt);

const markedRead = (item) =>
  item.readAt ? item : { ...item, readAt: new Date().toISOString() };

export function useNotificationCenter({ enabled }) {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [status, setStatus] = useState("idle");
  const unreadRef = useRef(0);
  const itemsRef = useRef([]);

  const applyUnread = useCallback((count) => {
    unreadRef.current = count;
    setUnreadCount(count);
  }, []);

  const applyItems = useCallback((nextItems) => {
    itemsRef.current = nextItems;
    setItems(nextItems);
  }, []);

  const refresh = useCallback(async () => {
    setStatus((prev) => (prev === "idle" ? "loading" : prev));
    const result = await listNotifications({ limit: PAGE_SIZE });
    if (!result.ok || !result.data) {
      setStatus("error");
      return;
    }
    applyItems(result.data.items);
    setNextCursor(result.data.nextCursor);
    applyUnread(result.data.unreadCount);
    setStatus("ready");
  }, [applyItems, applyUnread]);

  const loadMore = useCallback(async () => {
    if (!nextCursor) return;
    const result = await listNotifications({
      cursor: nextCursor,
      limit: PAGE_SIZE,
    });
    if (!result.ok || !result.data) return;
    const known = new Set(itemsRef.current.map((item) => item.id));
    applyItems([
      ...itemsRef.current,
      ...result.data.items.filter((item) => !known.has(item.id)),
    ]);
    setNextCursor(result.data.nextCursor);
    applyUnread(result.data.unreadCount);
  }, [applyItems, applyUnread, nextCursor]);

  const markRead = useCallback(
    async (id) => {
      if (!isUnreadIn(itemsRef.current, id)) return;
      applyItems(
        itemsRef.current.map((item) => (item.id === id ? markedRead(item) : item))
      );
      applyUnread(Math.max(0, unreadRef.current - 1));
      await markNotificationAsRead(id);
    },
    [applyItems, applyUnread]
  );

  const markAllRead = useCallback(async () => {
    applyItems(itemsRef.current.map(markedRead));
    applyUnread(0);
    await markAllNotificationsAsRead();
  }, [applyItems, applyUnread]);

  const remove = useCallback(
    async (id) => {
      if (isUnreadIn(itemsRef.current, id)) applyUnread(Math.max(0, unreadRef.current - 1));
      applyItems(itemsRef.current.filter((item) => item.id !== id));
      await deleteNotification(id);
    },
    [applyItems, applyUnread]
  );

  const clearAll = useCallback(async () => {
    applyItems([]);
    setNextCursor(null);
    applyUnread(0);
    await clearNotifications();
  }, [applyItems, applyUnread]);

  useEffect(() => {
    if (!enabled) return undefined;

    const initialLoad = window.setTimeout(refresh, 0);

    const checkForNews = async () => {
      if (document.visibilityState !== "visible") return;
      const result = await getUnreadNotificationCount();
      if (result.ok && result.data?.unreadCount !== unreadRef.current) {
        refresh();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    const handleWorkerMessage = (event) => {
      if (event.data?.type === NOTIFICATION_RECEIVED_MESSAGE) refresh();
      if (event.data?.type === NOTIFICATION_OPENED_MESSAGE && event.data.id) {
        markRead(event.data.id);
      }
    };

    const poll = window.setInterval(checkForNews, POLL_INTERVAL);
    document.addEventListener("visibilitychange", handleVisibility);
    navigator.serviceWorker?.addEventListener("message", handleWorkerMessage);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", handleVisibility);
      navigator.serviceWorker?.removeEventListener(
        "message",
        handleWorkerMessage
      );
    };
  }, [enabled, markRead, refresh]);

  return {
    items,
    unreadCount,
    hasMore: Boolean(nextCursor),
    status,
    refresh,
    loadMore,
    markRead,
    markAllRead,
    remove,
    clearAll,
  };
}
