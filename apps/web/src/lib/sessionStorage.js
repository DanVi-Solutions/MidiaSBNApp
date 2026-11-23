const SESSION_STORAGE_KEY = "midia_sbn_session";
const SESSION_EVENT_NAME = "midia-sbn:session-change";

function isBrowser() {
  return typeof window !== "undefined";
}

export function sanitizeCredential(credential) {
  if (!credential || typeof credential !== "object") {
    return null;
  }

  // Never persist readable credentialNumber in localStorage.
  const { credentialNumber: _omit, ...safeCredential } = credential;
  return safeCredential;
}

function normalizeStoredSession(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const accessToken = typeof raw.accessToken === "string" ? raw.accessToken : "";
  const refreshToken =
    typeof raw.refreshToken === "string" ? raw.refreshToken : "";
  const refreshTokenExpiresAt =
    typeof raw.refreshTokenExpiresAt === "string"
      ? raw.refreshTokenExpiresAt
      : null;
  const credential = sanitizeCredential(raw.credential);

  if (!accessToken || !refreshToken || !credential?.id) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    refreshTokenExpiresAt,
    credential,
  };
}

function emitSessionChange(session) {
  if (!isBrowser()) return;
  window.dispatchEvent(
    new CustomEvent(SESSION_EVENT_NAME, { detail: { session } })
  );
}

export function getStoredSession() {
  if (!isBrowser()) return null;

  try {
    const rawText = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!rawText) return null;
    const parsed = JSON.parse(rawText);
    return normalizeStoredSession(parsed);
  } catch {
    return null;
  }
}

export function setStoredSession(session) {
  const normalized = normalizeStoredSession(session);
  if (!normalized) {
    clearStoredSession();
    return null;
  }

  if (isBrowser()) {
    try {
      window.localStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify(normalized)
      );
    } catch {
      // Ignore storage quota errors cleanly
    }
    emitSessionChange(normalized);
  }

  return normalized;
}

export function updateStoredCredential(credential) {
  const current = getStoredSession();
  const safeCredential = sanitizeCredential(credential);
  if (!current || !safeCredential?.id) {
    return null;
  }

  return setStoredSession({
    ...current,
    credential: {
      ...current.credential,
      ...safeCredential,
    },
  });
}

export function clearStoredSession() {
  if (!isBrowser()) return;

  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage removal errors
  }

  emitSessionChange(null);
}

export function subscribeSessionChange(callback) {
  if (!isBrowser() || typeof callback !== "function") {
    return () => {};
  }

  const handleCustom = (event) => {
    callback(event?.detail?.session ?? getStoredSession());
  };

  const handleStorage = (event) => {
    if (event.key === SESSION_STORAGE_KEY || event.key === null) {
      callback(getStoredSession());
    }
  };

  window.addEventListener(SESSION_EVENT_NAME, handleCustom);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(SESSION_EVENT_NAME, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
}
