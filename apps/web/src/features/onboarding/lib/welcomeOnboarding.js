const STORAGE_KEY = "midia_sbn_welcome_onboarding";

const isBrowser = () => typeof window !== "undefined";

export function rememberWelcomeOnboarding(credentialId) {
  if (!isBrowser() || !credentialId) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, credentialId);
  } catch {
    return;
  }
}

export function hasPendingWelcomeOnboarding(credentialId) {
  if (!isBrowser() || !credentialId) return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === credentialId;
  } catch {
    return false;
  }
}

export function forgetWelcomeOnboarding() {
  if (!isBrowser()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
}
