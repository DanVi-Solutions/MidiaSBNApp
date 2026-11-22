"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  CloseIcon,
} from "@/components/ui/icons";
import styles from "./ToastProvider.module.css";

const MAX_TOASTS = 4;
const DEFAULT_DURATION_MS = 4500;

const ToastContext = createContext({
  showToast: () => "",
  dismissToast: () => {},
  success: () => "",
  error: () => "",
});

export function useToast() {
  return useContext(ToastContext);
}

function supportsNativePopover() {
  return (
    typeof HTMLElement !== "undefined" &&
    Object.hasOwn(HTMLElement.prototype, "popover")
  );
}

export function ToastProvider({ children }) {
  const viewportRef = useRef(null);
  const priorFocusRef = useRef(null);
  const closeButtonRefs = useRef(new Map());
  const timersRef = useRef(new Map());
  const pauseStateRef = useRef(new Map());
  const liveTimerRef = useRef(null);
  const idCounterRef = useRef(0);

  const [toasts, setToasts] = useState([]);
  const [politeText, setPoliteText] = useState("");
  const [assertiveText, setAssertiveText] = useState("");

  const clearToastTimer = useCallback((id) => {
    const entry = timersRef.current.get(id);
    if (entry?.timeoutId) {
      window.clearTimeout(entry.timeoutId);
    }
    timersRef.current.delete(id);
    pauseStateRef.current.delete(id);
  }, []);

  const dismissToast = useCallback(
    (id) => {
      clearToastTimer(id);
      setToasts((prev) => prev.filter((item) => item.id !== id));
    },
    [clearToastTimer]
  );

  const startTimer = useCallback(
    (id, durationMs) => {
      if (!durationMs || durationMs <= 0) return;

      const existing = timersRef.current.get(id);
      if (existing?.timeoutId) {
        window.clearTimeout(existing.timeoutId);
      }

      const timeoutId = window.setTimeout(() => {
        dismissToast(id);
      }, durationMs);

      timersRef.current.set(id, {
        timeoutId,
        remaining: durationMs,
        startedAt: Date.now(),
      });
    },
    [dismissToast]
  );

  const pauseTimer = useCallback((id) => {
    const entry = timersRef.current.get(id);
    if (!entry || !entry.timeoutId) return;

    window.clearTimeout(entry.timeoutId);
    const elapsed = Date.now() - entry.startedAt;
    entry.timeoutId = null;
    entry.remaining = Math.max(400, entry.remaining - elapsed);
  }, []);

  const resumeTimer = useCallback(
    (id) => {
      const pause = pauseStateRef.current.get(id);
      if (pause?.hovered || pause?.focused) return;

      const entry = timersRef.current.get(id);
      if (!entry || entry.timeoutId) return;
      startTimer(id, entry.remaining);
    },
    [startTimer]
  );

  const announce = useCallback((message, tone) => {
    const clean = String(message ?? "").trim();
    if (!clean) return;

    if (
      typeof document !== "undefined" &&
      typeof document.ariaNotify === "function"
    ) {
      document.ariaNotify(clean, {
        priority: tone === "error" ? "high" : "normal",
      });
      return;
    }

    if (liveTimerRef.current !== null) {
      window.clearTimeout(liveTimerRef.current);
    }

    if (tone === "error") {
      setAssertiveText("");
    } else {
      setPoliteText("");
    }

    liveTimerRef.current = window.setTimeout(() => {
      if (tone === "error") {
        setAssertiveText(clean);
      } else {
        setPoliteText(clean);
      }
    }, 60);
  }, []);

  const showToast = useCallback(
    (message, options = {}) => {
      const clean = String(message ?? "").trim();
      if (!clean) return "";

      const tone = options.tone === "error" ? "error" : "success";
      const duration =
        typeof options.duration === "number"
          ? options.duration
          : DEFAULT_DURATION_MS;

      idCounterRef.current += 1;
      const id = `toast-${idCounterRef.current}`;

      setToasts((prev) => {
        const next = [...prev, { id, message: clean, tone, duration }];
        if (next.length > MAX_TOASTS) {
          const evicted = next.slice(0, next.length - MAX_TOASTS);
          for (const item of evicted) {
            clearToastTimer(item.id);
          }
          return next.slice(-MAX_TOASTS);
        }
        return next;
      });

      pauseStateRef.current.set(id, { hovered: false, focused: false });
      startTimer(id, duration);
      announce(clean, tone);
      return id;
    },
    [announce, clearToastTimer, startTimer]
  );

  const success = useCallback(
    (message, options) => showToast(message, { ...options, tone: "success" }),
    [showToast]
  );

  const error = useCallback(
    (message, options) => showToast(message, { ...options, tone: "error" }),
    [showToast]
  );

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    if (!supportsNativePopover()) {
      viewport.classList.toggle(
        styles.toastViewportFallbackOpen,
        toasts.length > 0
      );
      return;
    }

    try {
      if (toasts.length > 0) {
        if (!viewport.matches(":popover-open")) {
          viewport.showPopover();
        }
      } else if (viewport.matches(":popover-open")) {
        viewport.hidePopover();
      }
      viewport.classList.remove(styles.toastViewportFallbackOpen);
    } catch {
      viewport.classList.toggle(
        styles.toastViewportFallbackOpen,
        toasts.length > 0
      );
    }
  }, [toasts.length]);

  useEffect(() => {
    const timersMap = timersRef.current;
    return () => {
      for (const entry of timersMap.values()) {
        if (entry?.timeoutId) {
          window.clearTimeout(entry.timeoutId);
        }
      }
      timersMap.clear();
      if (liveTimerRef.current !== null) {
        window.clearTimeout(liveTimerRef.current);
      }
    };
  }, []);

  const handleViewportFocusCapture = (event) => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (
      event.relatedTarget instanceof HTMLElement &&
      !viewport.contains(event.relatedTarget)
    ) {
      priorFocusRef.current = event.relatedTarget;
    }
  };

  const handleToastMouseEnter = (id) => {
    const state = pauseStateRef.current.get(id) || {
      hovered: false,
      focused: false,
    };
    state.hovered = true;
    pauseStateRef.current.set(id, state);
    pauseTimer(id);
  };

  const handleToastMouseLeave = (id) => {
    const state = pauseStateRef.current.get(id);
    if (!state) return;
    state.hovered = false;
    resumeTimer(id);
  };

  const handleToastFocus = (id) => {
    const state = pauseStateRef.current.get(id) || {
      hovered: false,
      focused: false,
    };
    state.focused = true;
    pauseStateRef.current.set(id, state);
    pauseTimer(id);
  };

  const handleToastBlur = (id, event) => {
    if (event.currentTarget.contains(event.relatedTarget)) {
      return;
    }
    const state = pauseStateRef.current.get(id);
    if (!state) return;
    state.focused = false;
    resumeTimer(id);
  };

  const handleManualDismiss = (id) => {
    const closeBtn = closeButtonRefs.current.get(id);
    const wasFocused =
      typeof document !== "undefined" &&
      closeBtn &&
      document.activeElement === closeBtn;

    const remaining = toasts.filter((item) => item.id !== id);
    dismissToast(id);

    if (wasFocused) {
      window.requestAnimationFrame(() => {
        if (remaining.length > 0) {
          const nextBtn = closeButtonRefs.current.get(remaining[0].id);
          nextBtn?.focus();
          return;
        }
        if (priorFocusRef.current?.isConnected) {
          priorFocusRef.current.focus();
        }
        priorFocusRef.current = null;
      });
    }
  };

  const contextValue = useMemo(
    () => ({
      showToast,
      dismissToast,
      success,
      error,
    }),
    [showToast, dismissToast, success, error]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}

      <p className="visually-hidden">Notificações do sistema</p>
      <div className="visually-hidden" aria-live="polite">
        {politeText}
      </div>
      <div className="visually-hidden" aria-live="assertive">
        {assertiveText}
      </div>

      <div
        ref={viewportRef}
        role="region"
        aria-label="Notificações"
        popover="manual"
        className={styles.toastViewport}
        onFocusCapture={handleViewportFocusCapture}
      >
        {toasts.map((item) => {
          const isError = item.tone === "error";

          return (
            <div
              key={item.id}
              className={`${styles.toastItem} ${
                isError ? styles.toastError : styles.toastSuccess
              }`}
              onMouseEnter={() => handleToastMouseEnter(item.id)}
              onMouseLeave={() => handleToastMouseLeave(item.id)}
              onFocus={() => handleToastFocus(item.id)}
              onBlur={(event) => handleToastBlur(item.id, event)}
            >
              <span className={styles.toastIcon} aria-hidden="true">
                {isError ? <AlertCircleIcon /> : <CheckCircleIcon />}
              </span>

              <span className={styles.toastMessage}>{item.message}</span>

              <button
                ref={(node) => {
                  if (node) {
                    closeButtonRefs.current.set(item.id, node);
                  } else {
                    closeButtonRefs.current.delete(item.id);
                  }
                }}
                type="button"
                aria-label="Fechar notificação"
                className={styles.toastCloseButton}
                onClick={() => handleManualDismiss(item.id)}
              >
                <CloseIcon />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
