"use client";

import { useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "midia_sbn_theme_v1";
export const DEFAULT_THEME = "light";

const listeners = new Set();
let storageListenerAttached = false;

export function normalizeTheme(value) {
  return value === "dark" ? "dark" : DEFAULT_THEME;
}

export function getStoredTheme() {
  if (typeof window === "undefined") {
    return DEFAULT_THEME;
  }

  try {
    return normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function getAppliedTheme() {
  if (typeof document === "undefined") {
    return DEFAULT_THEME;
  }

  const attr = document.documentElement.dataset.theme;
  if (attr === "light" || attr === "dark") {
    return attr;
  }

  return getStoredTheme();
}

function handleStorageChange(event) {
  if (event.key !== THEME_STORAGE_KEY) {
    return;
  }

  const next = normalizeTheme(event.newValue);
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = next;
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);

  if (typeof window !== "undefined" && !storageListenerAttached) {
    window.addEventListener("storage", handleStorageChange);
    storageListenerAttached = true;
  }

  return () => {
    listeners.delete(listener);
    if (
      listeners.size === 0 &&
      typeof window !== "undefined" &&
      storageListenerAttached
    ) {
      window.removeEventListener("storage", handleStorageChange);
      storageListenerAttached = false;
    }
  };
}

export function setTheme(nextTheme) {
  const normalized = normalizeTheme(nextTheme);

  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = normalized;
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch {
      // Ignora falhas de storage em navegacao restrita.
    }
  }

  listeners.forEach((listener) => listener());
  return normalized;
}

export function useTheme() {
  const theme = useSyncExternalStore(
    subscribe,
    getAppliedTheme,
    () => DEFAULT_THEME,
  );

  return {
    theme,
    setTheme,
    isDark: theme === "dark",
  };
}
