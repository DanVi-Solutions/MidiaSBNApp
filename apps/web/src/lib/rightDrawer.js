const COLLAPSED_ATTR = "data-collapsed";
const CLOSING_ATTR = "data-closing";
const TRANSITION_ATTR = "data-drawer-transition";
const HOVER_COOLDOWN_MS = 250;

const lastFocusedMap = new WeakMap();
let supportsDisplayTransition;

function canTransitionDisplay() {
  if (supportsDisplayTransition !== undefined) {
    return supportsDisplayTransition;
  }
  if (
    typeof window === "undefined" ||
    !window.CSS?.supports?.("transition-behavior", "allow-discrete") ||
    !document.body
  ) {
    return false;
  }
  const probe = document.createElement("div");
  probe.style.cssText =
    "transition: display 1s allow-discrete !important; display: block;";
  document.body.appendChild(probe);
  window.getComputedStyle(probe).display;
  probe.style.display = "none";
  supportsDisplayTransition =
    window.getComputedStyle(probe).display === "block";
  probe.remove();
  return supportsDisplayTransition;
}

function supportsTopLayerExit() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.CSS?.supports?.("overlay", "auto")) &&
    canTransitionDisplay()
  );
}

export function isDialogInHiddenSubtree(dialog) {
  if (!dialog || !dialog.isConnected) return true;

  let node = dialog.parentElement;
  while (node && node !== document.documentElement) {
    if (
      node.hidden ||
      (typeof window !== "undefined" &&
        window.getComputedStyle(node).display === "none")
    ) {
      return true;
    }
    node = node.parentElement;
  }

  return false;
}

export function clearRightDrawerAttrs(dialog) {
  if (!dialog) return;
  dialog.removeAttribute(COLLAPSED_ATTR);
  dialog.removeAttribute(TRANSITION_ATTR);
  delete dialog.dataset.collapsedAt;
}

export function isRightDrawerCollapsed(dialog) {
  return Boolean(dialog?.hasAttribute(COLLAPSED_ATTR));
}

export function shouldIgnoreRightDrawerClose(dialog) {
  return Boolean(
    dialog &&
      (dialog.open ||
        dialog.hasAttribute(COLLAPSED_ATTR) ||
        dialog.hasAttribute(TRANSITION_ATTR))
  );
}

export function canHoverExpandRightDrawer(dialog) {
  const collapsedAt = Number(dialog?.dataset?.collapsedAt || 0);
  return Date.now() - collapsedAt >= HOVER_COOLDOWN_MS;
}

export async function closeAnimatedRightDrawer(dialog) {
  if (!dialog || !dialog.open) return;

  clearRightDrawerAttrs(dialog);

  if (!supportsTopLayerExit()) {
    dialog.setAttribute(CLOSING_ATTR, "");
    const animations = dialog.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((resolve) => window.setTimeout(resolve, 1000)),
      ]);
    }
    if (!dialog.hasAttribute(CLOSING_ATTR)) return;
    dialog.removeAttribute(CLOSING_ATTR);
  }

  if (dialog.open) {
    dialog.close();
  }
}

export function collapseRightDrawer(dialog) {
  if (
    !dialog ||
    !dialog.open ||
    dialog.hasAttribute(CLOSING_ATTR) ||
    dialog.hasAttribute(COLLAPSED_ATTR)
  ) {
    return false;
  }

  if (
    typeof document !== "undefined" &&
    document.activeElement &&
    dialog.contains(document.activeElement)
  ) {
    lastFocusedMap.set(dialog, document.activeElement);
  }

  try {
    dialog.querySelectorAll(":popover-open").forEach((el) => {
      el.hidePopover?.();
    });
  } catch {
    // Ignore unsupported :popover-open selector
  }

  dialog.setAttribute(TRANSITION_ATTR, "collapsing");
  dialog.setAttribute(COLLAPSED_ATTR, "true");
  dialog.dataset.collapsedAt = String(Date.now());

  if (dialog.matches(":modal")) {
    dialog.close();
    dialog.show();
  }

  window.requestAnimationFrame(() => {
    if (dialog.getAttribute(TRANSITION_ATTR) === "collapsing") {
      dialog.removeAttribute(TRANSITION_ATTR);
    }
  });

  return true;
}

export function expandRightDrawer(dialog) {
  if (!dialog || !dialog.hasAttribute(COLLAPSED_ATTR)) return false;

  if (isDialogInHiddenSubtree(dialog)) {
    clearRightDrawerAttrs(dialog);
    dialog.removeAttribute(CLOSING_ATTR);
    if (dialog.open) {
      dialog.close();
    }
    return false;
  }

  dialog.setAttribute(TRANSITION_ATTR, "expanding");
  dialog.removeAttribute(COLLAPSED_ATTR);
  delete dialog.dataset.collapsedAt;

  if (dialog.open) {
    dialog.close();
  }
  dialog.showModal();

  const prevFocused = lastFocusedMap.get(dialog);
  window.requestAnimationFrame(() => {
    if (dialog.getAttribute(TRANSITION_ATTR) === "expanding") {
      dialog.removeAttribute(TRANSITION_ATTR);
    }
    if (prevFocused && prevFocused.isConnected && dialog.contains(prevFocused)) {
      prevFocused.focus({ preventScroll: true });
    }
  });

  return true;
}

export function dismissAllRightDrawers(exceptDialog = null) {
  if (typeof document === "undefined") return;
  const drawers = document.querySelectorAll('dialog[data-side-drawer="right"]');

  drawers.forEach((other) => {
    if (other === exceptDialog) return;
    if (
      other.open ||
      other.hasAttribute(COLLAPSED_ATTR) ||
      other.hasAttribute(CLOSING_ATTR) ||
      other.hasAttribute(TRANSITION_ATTR)
    ) {
      clearRightDrawerAttrs(other);
      other.removeAttribute(CLOSING_ATTR);
      if (other.open) {
        other.close();
      }
    }
  });
}

export function dismissCollapsedRightDrawers(exceptDialog = null) {
  dismissAllRightDrawers(exceptDialog);
}

export function dismissHiddenModalDialogs() {
  if (typeof document === "undefined") return;
  const openDialogs = document.querySelectorAll("dialog[open]");

  openDialogs.forEach((dialog) => {
    if (!isDialogInHiddenSubtree(dialog)) return;

    let isModal = false;
    try {
      isModal = dialog.matches(":modal");
    } catch {
      isModal = false;
    }

    if (
      isModal ||
      (dialog.dataset.sideDrawer === "right" &&
        !dialog.hasAttribute(COLLAPSED_ATTR))
    ) {
      clearRightDrawerAttrs(dialog);
      dialog.removeAttribute(CLOSING_ATTR);
      dialog.close();
    }
  });
}

const SHEET_QUERY = "(max-width: 640px)";
const SHEET_GRAB_AREA = 72;
const SHEET_COLLAPSE_DISTANCE = 110;
const sheetGestureReady = new WeakSet();

function enableSheetSwipeToCollapse(dialog) {
  if (sheetGestureReady.has(dialog) || typeof window === "undefined") return;
  sheetGestureReady.add(dialog);

  let startY = null;
  let offset = 0;

  const reset = () => {
    startY = null;
    offset = 0;
    dialog.removeAttribute("data-sheet-dragging");
    dialog.style.removeProperty("transform");
  };

  dialog.addEventListener(
    "touchstart",
    (event) => {
      if (!window.matchMedia(SHEET_QUERY).matches || event.touches.length !== 1) return;
      const touchY = event.touches[0].clientY;
      if (touchY - dialog.getBoundingClientRect().top > SHEET_GRAB_AREA) return;
      startY = touchY;
    },
    { passive: true }
  );

  dialog.addEventListener(
    "touchmove",
    (event) => {
      if (startY === null) return;
      offset = Math.max(0, event.touches[0].clientY - startY);
      dialog.setAttribute("data-sheet-dragging", "");
      dialog.style.transform = `translateY(${offset}px)`;
    },
    { passive: true }
  );

  const finish = () => {
    if (startY === null) return;
    const shouldCollapse = offset > SHEET_COLLAPSE_DISTANCE;
    reset();
    if (shouldCollapse) collapseRightDrawer(dialog);
  };

  dialog.addEventListener("touchend", finish);
  dialog.addEventListener("touchcancel", reset);
}

export function openRightDrawer(dialog) {
  if (!dialog || isDialogInHiddenSubtree(dialog)) return false;
  enableSheetSwipeToCollapse(dialog);
  const isCollapsed = dialog.hasAttribute(COLLAPSED_ATTR);
  if (dialog.open && !isCollapsed && !dialog.hasAttribute(CLOSING_ATTR)) {
    return false;
  }

  dismissAllRightDrawers(dialog);
  dialog.removeAttribute(CLOSING_ATTR);
  clearRightDrawerAttrs(dialog);

  if (dialog.open) {
    dialog.setAttribute(TRANSITION_ATTR, "reopening");
    dialog.close();
    dialog.showModal();
    window.requestAnimationFrame(() => {
      if (dialog.getAttribute(TRANSITION_ATTR) === "reopening") {
        dialog.removeAttribute(TRANSITION_ATTR);
      }
    });
  } else {
    dialog.showModal();
  }

  return true;
}

export function setupRightDrawerOutsideCollapse(
  dialog,
  { canCollapse = () => true } = {}
) {
  if (!dialog) return undefined;

  const isOutside = (event) => {
    const rect = dialog.getBoundingClientRect();
    return (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    );
  };

  let pressedOutside = false;

  const handlePointerDown = (event) => {
    pressedOutside =
      event.target === dialog &&
      !dialog.hasAttribute(COLLAPSED_ATTR) &&
      isOutside(event);
  };

  const handlePointerUp = (event) => {
    const shouldCollapse =
      pressedOutside &&
      isOutside(event) &&
      dialog.open &&
      dialog.matches(":modal") &&
      !dialog.hasAttribute(COLLAPSED_ATTR) &&
      canCollapse();

    pressedOutside = false;

    if (shouldCollapse) {
      collapseRightDrawer(dialog);
    }
  };

  const handlePointerCancel = () => {
    pressedOutside = false;
  };

  dialog.addEventListener("pointerdown", handlePointerDown);
  dialog.addEventListener("pointerup", handlePointerUp);
  dialog.addEventListener("pointercancel", handlePointerCancel);

  return () => {
    dialog.removeEventListener("pointerdown", handlePointerDown);
    dialog.removeEventListener("pointerup", handlePointerUp);
    dialog.removeEventListener("pointercancel", handlePointerCancel);
  };
}
