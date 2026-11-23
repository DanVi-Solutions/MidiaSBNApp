import {
  getPushRegistration,
  getPushSettings,
  registerPushSubscription,
  unregisterPushSubscription,
} from "@/features/notifications/services/notificationsService";

const SERVICE_WORKER_URL = "/sw.js";

export const NOTIFICATION_RECEIVED_MESSAGE = "midia-sbn:notification-received";
export const NOTIFICATION_OPENED_MESSAGE = "midia-sbn:notification-opened";

export const DEVICE_PUSH_STATE = Object.freeze({
  UNSUPPORTED: "unsupported",
  NEEDS_INSTALL: "needs-install",
  UNAVAILABLE: "unavailable",
  BLOCKED: "blocked",
  OFF: "off",
  ON: "on",
});

export const ENABLE_FAILURE = Object.freeze({
  DENIED: "denied",
  DISMISSED: "dismissed",
  UNAVAILABLE: "unavailable",
  FAILED: "failed",
});

function isBrowser() {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

export function isDevicePushSupported() {
  return (
    isBrowser() &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function isAppleMobile() {
  const isIosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent);
  const isIpadOs =
    navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return isIosDevice || isIpadOs;
}

function isInstalledApp() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    navigator.standalone === true
  );
}

function needsHomeScreenInstall() {
  return isBrowser() && isAppleMobile() && !isInstalledApp();
}

function decodeServerKey(base64Url) {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

function usesServerKey(subscription, serverKey) {
  const current = subscription.options?.applicationServerKey;
  if (!current) return false;
  const currentBytes = new Uint8Array(current);
  return (
    currentBytes.length === serverKey.length &&
    currentBytes.every((byte, index) => byte === serverKey[index])
  );
}

export function registerServiceWorker() {
  if (!isBrowser() || !("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker
    .register(SERVICE_WORKER_URL, { scope: "/" })
    .catch(() => null);
}

async function existingSubscription() {
  const registration = await navigator.serviceWorker.getRegistration("/");
  return registration ? registration.pushManager.getSubscription() : null;
}

async function subscribeThisDevice() {
  const settings = await getPushSettings();
  if (!settings.ok || !settings.data?.enabled || !settings.data.publicKey) {
    return { ok: false, reason: ENABLE_FAILURE.UNAVAILABLE };
  }

  try {
    await registerServiceWorker();
    const registration = await navigator.serviceWorker.ready;
    const serverKey = decodeServerKey(settings.data.publicKey);

    let subscription = await registration.pushManager.getSubscription();
    if (subscription && !usesServerKey(subscription, serverKey)) {
      await subscription.unsubscribe();
      subscription = null;
    }
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: serverKey,
    });

    const result = await registerPushSubscription(subscription.toJSON());
    return result.ok
      ? { ok: true }
      : { ok: false, reason: ENABLE_FAILURE.FAILED, error: result.error };
  } catch {
    return { ok: false, reason: ENABLE_FAILURE.FAILED };
  }
}

export async function enableDevicePush() {
  if (!isDevicePushSupported()) {
    return { ok: false, reason: ENABLE_FAILURE.UNAVAILABLE };
  }

  const permission = await Notification.requestPermission();
  if (permission === "denied") {
    return { ok: false, reason: ENABLE_FAILURE.DENIED };
  }
  if (permission !== "granted") {
    return { ok: false, reason: ENABLE_FAILURE.DISMISSED };
  }

  return subscribeThisDevice();
}

export async function reconnectDevicePush() {
  if (!isDevicePushSupported() || Notification.permission !== "granted") {
    return;
  }
  await subscribeThisDevice();
}

export async function disableDevicePush() {
  if (!isDevicePushSupported()) return { ok: true };

  try {
    const subscription = await existingSubscription();
    if (!subscription) return { ok: true };

    const result = await unregisterPushSubscription(subscription.endpoint);
    await subscription.unsubscribe();
    return result.ok ? { ok: true } : { ok: false, error: result.error };
  } catch {
    return { ok: false };
  }
}

export async function readDevicePushState() {
  if (!isDevicePushSupported()) {
    return needsHomeScreenInstall()
      ? DEVICE_PUSH_STATE.NEEDS_INSTALL
      : DEVICE_PUSH_STATE.UNSUPPORTED;
  }

  const settings = await getPushSettings();
  if (!settings.ok || !settings.data?.enabled) {
    return DEVICE_PUSH_STATE.UNAVAILABLE;
  }

  if (Notification.permission === "denied") return DEVICE_PUSH_STATE.BLOCKED;
  if (Notification.permission !== "granted") return DEVICE_PUSH_STATE.OFF;

  try {
    const subscription = await existingSubscription();
    if (!subscription) return DEVICE_PUSH_STATE.OFF;
    const registration = await getPushRegistration(subscription.endpoint);
    if (registration.ok && registration.data?.registered) {
      return DEVICE_PUSH_STATE.ON;
    }
    const relinked = await registerPushSubscription(subscription.toJSON());
    return relinked.ok ? DEVICE_PUSH_STATE.ON : DEVICE_PUSH_STATE.OFF;
  } catch {
    return DEVICE_PUSH_STATE.OFF;
  }
}
