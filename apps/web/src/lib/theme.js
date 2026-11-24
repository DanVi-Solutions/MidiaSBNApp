"use client";

import { useSyncExternalStore } from "react";

export const THEME_STORAGE_KEY = "midia_sbn_theme_v1";

export const THEME_PREFERENCE = Object.freeze({
  SYSTEM: "system",
  LIGHT: "light",
  DARK: "dark",
});

export const DEFAULT_THEME_PREFERENCE = THEME_PREFERENCE.SYSTEM;

const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";
const listeners = new Set();
let browserListenersAttached = false;

export function normalizePreference(value) {
  return value === THEME_PREFERENCE.LIGHT || value === THEME_PREFERENCE.DARK ? value : THEME_PREFERENCE.SYSTEM;
}

function systemPrefersDark() {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.(DARK_SCHEME_QUERY).matches);
}

function resolveTheme(preference) {
  if (preference === THEME_PREFERENCE.SYSTEM) return systemPrefersDark() ? "dark" : "light";
  return preference;
}

export function getStoredPreference() {
  if (typeof window === "undefined") return DEFAULT_THEME_PREFERENCE;
  try {
    return normalizePreference(window.localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME_PREFERENCE;
  }
}

export function getAppliedTheme() {
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.dataset.theme;
  return attr === "dark" || attr === "light" ? attr : resolveTheme(getStoredPreference());
}

function applyStoredPreference() {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = resolveTheme(getStoredPreference());
  }
  listeners.forEach((listener) => listener());
}

function handleStorageChange(event) {
  if (event.key === THEME_STORAGE_KEY) applyStoredPreference();
}

function handleSystemSchemeChange() {
  if (getStoredPreference() === THEME_PREFERENCE.SYSTEM) applyStoredPreference();
}

function subscribe(listener) {
  listeners.add(listener);

  if (typeof window !== "undefined" && !browserListenersAttached) {
    window.addEventListener("storage", handleStorageChange);
    window.matchMedia?.(DARK_SCHEME_QUERY).addEventListener("change", handleSystemSchemeChange);
    browserListenersAttached = true;
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined" && browserListenersAttached) {
      window.removeEventListener("storage", handleStorageChange);
      window.matchMedia?.(DARK_SCHEME_QUERY).removeEventListener("change", handleSystemSchemeChange);
      browserListenersAttached = false;
    }
  };
}

export function setThemePreference(nextPreference) {
  const preference = normalizePreference(nextPreference);
  if (typeof window !== "undefined") {
    try {
      if (preference === THEME_PREFERENCE.SYSTEM) window.localStorage.removeItem(THEME_STORAGE_KEY);
      else window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // Ignora falhas de storage em navegacao restrita.
    }
  }
  applyStoredPreference();
  return preference;
}

export function useTheme() {
  const preference = useSyncExternalStore(subscribe, getStoredPreference, () => DEFAULT_THEME_PREFERENCE);
  const theme = useSyncExternalStore(subscribe, getAppliedTheme, () => "light");

  return {
    preference,
    theme,
    isDark: theme === "dark",
    setThemePreference,
  };
}
