export const INSTALL_PLATFORM = Object.freeze({
  IOS: "ios",
  ANDROID: "android",
  DESKTOP: "desktop",
});

export const INSTALL_OUTCOME = Object.freeze({
  ACCEPTED: "accepted",
  DISMISSED: "dismissed",
  UNAVAILABLE: "unavailable",
});

let deferredPrompt = null;
const listeners = new Set();

const notifyListeners = () => listeners.forEach((listener) => listener());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    deferredPrompt = event;
    notifyListeners();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notifyListeners();
  });
}

export function detectInstallPlatform() {
  if (typeof navigator === "undefined") return INSTALL_PLATFORM.DESKTOP;
  const userAgent = navigator.userAgent || "";
  const isIos = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/.test(userAgent) && navigator.maxTouchPoints > 1);
  if (isIos) return INSTALL_PLATFORM.IOS;
  if (/Android/i.test(userAgent)) return INSTALL_PLATFORM.ANDROID;
  return INSTALL_PLATFORM.DESKTOP;
}

export function isRunningAsInstalledApp() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export const canPromptInstall = () => Boolean(deferredPrompt);

export function subscribeInstallPrompt(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function promptInstall() {
  if (!deferredPrompt) return INSTALL_OUTCOME.UNAVAILABLE;
  const event = deferredPrompt;
  deferredPrompt = null;
  notifyListeners();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === INSTALL_OUTCOME.ACCEPTED ? INSTALL_OUTCOME.ACCEPTED : INSTALL_OUTCOME.DISMISSED;
}
