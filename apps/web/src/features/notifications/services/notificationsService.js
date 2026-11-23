import { apiRequest } from "@/lib/apiClient";

export function listNotifications({ cursor, limit = 20 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return apiRequest(`/notifications?${params}`);
}

export function getUnreadNotificationCount() {
  return apiRequest("/notifications/unread-count");
}

export function markNotificationAsRead(id) {
  return apiRequest(`/notifications/${encodeURIComponent(id)}/read`, {
    method: "PATCH",
  });
}

export function markAllNotificationsAsRead() {
  return apiRequest("/notifications/read-all", { method: "POST" });
}

export function deleteNotification(id) {
  return apiRequest(`/notifications/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function clearNotifications() {
  return apiRequest("/notifications", { method: "DELETE" });
}

export function getPushSettings() {
  return apiRequest("/notifications/push");
}

export function getPushRegistration(endpoint) {
  return apiRequest(
    `/notifications/push/subscription?endpoint=${encodeURIComponent(endpoint)}`
  );
}

export function registerPushSubscription({ endpoint, keys }) {
  return apiRequest("/notifications/push/subscription", {
    method: "PUT",
    body: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
  });
}

export function unregisterPushSubscription(endpoint) {
  return apiRequest("/notifications/push/subscription", {
    method: "DELETE",
    body: { endpoint },
  });
}

export function sendTestPush() {
  return apiRequest("/notifications/push/test", { method: "POST" });
}
