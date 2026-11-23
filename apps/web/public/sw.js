const DEFAULT_URL = "/schedule";
const NOTIFICATION_RECEIVED = "midia-sbn:notification-received";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

function readPayload(event) {
  try {
    return event.data ? event.data.json() : {};
  } catch {
    return { body: event.data ? event.data.text() : "" };
  }
}

async function tellOpenTabs(message) {
  const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const tab of tabs) tab.postMessage(message);
}

self.addEventListener("push", (event) => {
  const payload = readPayload(event);
  const title = payload.title || "Mídia Sobrenatural";

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body: payload.body || "",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        tag: payload.id || undefined,
        data: { id: payload.id || null, url: payload.url || DEFAULT_URL },
      }),
      tellOpenTabs({ type: NOTIFICATION_RECEIVED, id: payload.id || null }),
    ])
  );
});

async function focusOrOpen(url) {
  const target = new URL(url, self.location.origin).href;
  const tabs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const sameOrigin = tabs.filter((tab) => new URL(tab.url).origin === self.location.origin);

  const exact = sameOrigin.find((tab) => tab.url === target);
  if (exact) return exact.focus();

  const any = sameOrigin[0];
  if (any) {
    await any.focus();
    return any.navigate(target).catch(() => any);
  }

  return self.clients.openWindow(target);
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { id, url } = event.notification.data || {};

  event.waitUntil(
    Promise.all([
      focusOrOpen(url || DEFAULT_URL),
      id ? tellOpenTabs({ type: "midia-sbn:notification-opened", id }) : null,
    ])
  );
});
