"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronLeftIcon } from "@/components/ui/icons";
import {
  canHoverExpandRightDrawer,
  expandRightDrawer,
  isDialogInHiddenSubtree,
} from "@/lib/rightDrawer";
import styles from "./RightDrawerEdgeHandle.module.css";

const COLLAPSED_DRAWER_SELECTOR =
  'dialog[data-side-drawer="right"][open][data-collapsed="true"]:not([data-closing])';

function findCollapsedDrawerLabel(dialog) {
  if (!dialog) return "Continuar painel";
  const labelledBy = dialog.getAttribute("aria-labelledby");
  if (labelledBy) {
    const titleEl = document.getElementById(labelledBy);
    const titleText = titleEl?.textContent?.trim();
    if (titleText) return titleText;
  }
  return dialog.getAttribute("aria-label")?.trim() || "Continuar painel";
}

export function RightDrawerEdgeHandle() {
  const pathname = usePathname();
  const collapsedDialogRef = useRef(null);
  const [hasCollapsedDrawer, setHasCollapsedDrawer] = useState(false);
  const [drawerLabel, setDrawerLabel] = useState("Continuar painel");

  const syncCollapsedDrawer = useCallback(() => {
    if (typeof document === "undefined") return;
    const candidates = document.querySelectorAll(COLLAPSED_DRAWER_SELECTOR);
    const collapsed =
      Array.from(candidates).find((el) => !isDialogInHiddenSubtree(el)) || null;

    collapsedDialogRef.current = collapsed;
    if (collapsed) {
      setDrawerLabel(findCollapsedDrawerLabel(collapsed));
      setHasCollapsedDrawer(true);
    } else {
      setHasCollapsedDrawer(false);
    }
  }, []);

  useEffect(() => {
    if (typeof document === "undefined" || !document.body) return undefined;

    const rafId = window.requestAnimationFrame(syncCollapsedDrawer);
    const timerId = window.setTimeout(syncCollapsedDrawer, 60);

    const observer = new MutationObserver(syncCollapsedDrawer);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["open", "data-collapsed", "data-closing"],
      childList: true,
      subtree: true,
    });

    document.addEventListener("close", syncCollapsedDrawer, true);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
      observer.disconnect();
      document.removeEventListener("close", syncCollapsedDrawer, true);
    };
  }, [pathname, syncCollapsedDrawer]);

  if (!hasCollapsedDrawer) {
    return null;
  }

  const handlePointerEnter = (event) => {
    if (event.pointerType && event.pointerType !== "mouse") return;
    const dialog = collapsedDialogRef.current;
    if (!dialog) return;
    if (isDialogInHiddenSubtree(dialog)) {
      syncCollapsedDrawer();
      return;
    }
    if (!canHoverExpandRightDrawer(dialog)) return;
    expandRightDrawer(dialog);
  };

  const handleExpandClick = () => {
    const dialog = collapsedDialogRef.current;
    if (!dialog) return;
    if (isDialogInHiddenSubtree(dialog)) {
      syncCollapsedDrawer();
      return;
    }
    expandRightDrawer(dialog);
  };

  return (
    <div className={styles.edgeDock} data-right-drawer-handle="true">
      <div
        className={styles.edgeHotZone}
        aria-hidden="true"
        onPointerEnter={handlePointerEnter}
      />

      <button
        type="button"
        className={styles.edgeHandle}
        title={`Expandir painel: ${drawerLabel}`}
        aria-label={`Expandir painel ${drawerLabel}`}
        onPointerEnter={handlePointerEnter}
        onClick={handleExpandClick}
      >
        <span className={styles.edgeHandleDot} aria-hidden="true" />
        <ChevronLeftIcon className={styles.edgeHandleArrow} />
      </button>
    </div>
  );
}
