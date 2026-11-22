"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import styles from "./LoginVisualPanel.module.css";

const POINT_COUNT = 10;
const GLITCH_VARIANTS = ["signal-bars", "logo-tear", "blob-interference"];

function createBlobPoints(cx, cy, baseRadius, time, pointer, impact) {
  const points = [];
  for (let i = 0; i < POINT_COUNT; i += 1) {
    const angle = (i / POINT_COUNT) * Math.PI * 2;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Irrational frequency ratios keep organic surface motion non-repeating
    const waveA = Math.sin(angle * 2 + time * 0.61) * 0.048;
    const waveB = Math.cos(angle * 3 - time * 1.13 + 0.9) * 0.032;
    const waveC = Math.sin(angle * 5 + time * 1.73 + 2.1) * 0.015;
    const waveD = Math.cos(angle * 2 - time * 2.29 + 1.4) * 0.012;

    // Gentle directional attraction toward cursor position
    const pointerAlignment = cosA * pointer.x + sinA * pointer.y;
    const pointerPull = pointerAlignment * 0.038 * impact;

    const r = baseRadius * (1 + waveA + waveB + waveC + waveD + pointerPull);
    points.push({
      x: cx + cosA * r,
      y: cy + sinA * r,
    });
  }
  return points;
}

function traceClosedOrganicCurve(ctx, points) {
  const total = points.length;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 0; i < total; i += 1) {
    const p0 = points[(i - 1 + total) % total];
    const p1 = points[i];
    const p2 = points[(i + 1) % total];
    const p3 = points[(i + 2) % total];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }

  ctx.closePath();
}

function drawObsidianBlob(
  ctx,
  width,
  height,
  time,
  pointer,
  glitchState,
  scratchCanvas
) {
  ctx.clearRect(0, 0, width, height);

  const minDim = Math.min(width, height);
  const breathe = 1 + Math.sin(time * 0.72) * 0.018;
  const baseRadius = minDim * 0.375 * breathe;

  const cx = width * 0.5 + pointer.x * minDim * 0.024 + Math.sin(time * 0.43) * 2.5;
  const cy = height * 0.5 + pointer.y * minDim * 0.024 + Math.cos(time * 0.37) * 2.5;
  const impact = Math.min(1, Math.hypot(pointer.x, pointer.y));

  const points = createBlobPoints(cx, cy, baseRadius, time, pointer, impact);

  // Soft outer ambient shadow + subtle studio rim
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.72)";
  ctx.shadowBlur = minDim * 0.14;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = minDim * 0.05;

  traceClosedOrganicCurve(ctx, points);

  const lightX = cx - baseRadius * 0.34 + pointer.x * baseRadius * 0.28 + Math.sin(time * 0.55) * baseRadius * 0.05;
  const lightY = cy - baseRadius * 0.36 + pointer.y * baseRadius * 0.28 + Math.cos(time * 0.48) * baseRadius * 0.05;

  const bodyGrad = ctx.createRadialGradient(
    lightX,
    lightY,
    baseRadius * 0.06,
    cx + baseRadius * 0.08,
    cy + baseRadius * 0.08,
    baseRadius * 1.18
  );
  bodyGrad.addColorStop(0, "#2c302b");
  bodyGrad.addColorStop(0.28, "#1e211d");
  bodyGrad.addColorStop(0.68, "#131512");
  bodyGrad.addColorStop(1, "#0b0d0a");

  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.restore();

  // Internal matte sheen + secondary rim bounce clipped to organic contour
  ctx.save();
  traceClosedOrganicCurve(ctx, points);
  ctx.clip();

  const specGrad = ctx.createRadialGradient(
    lightX,
    lightY,
    0,
    lightX,
    lightY,
    baseRadius * 0.72
  );
  specGrad.addColorStop(0, "rgba(255, 255, 255, 0.085)");
  specGrad.addColorStop(0.45, "rgba(255, 255, 255, 0.025)");
  specGrad.addColorStop(1, "rgba(255, 255, 255, 0)");
  ctx.fillStyle = specGrad;
  ctx.fillRect(0, 0, width, height);

  const rimGrad = ctx.createRadialGradient(
    cx + baseRadius * 0.52,
    cy + baseRadius * 0.54,
    baseRadius * 0.1,
    cx + baseRadius * 0.38,
    cy + baseRadius * 0.4,
    baseRadius * 0.9
  );
  rimGrad.addColorStop(0, "rgba(198, 214, 198, 0.05)");
  rimGrad.addColorStop(0.6, "rgba(198, 214, 198, 0.012)");
  rimGrad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = rimGrad;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  // Crisp faint outer edge highlight
  ctx.save();
  traceClosedOrganicCurve(ctx, points);
  ctx.strokeStyle = "rgba(255, 255, 255, 0.048)";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.restore();

  // Localized horizontal slice tear + faint scanlines during blob-interference glitch
  if (glitchState.active && scratchCanvas) {
    const scratchCtx = scratchCanvas.getContext("2d");
    if (scratchCtx) {
      if (
        scratchCanvas.width !== ctx.canvas.width ||
        scratchCanvas.height !== ctx.canvas.height
      ) {
        scratchCanvas.width = ctx.canvas.width;
        scratchCanvas.height = ctx.canvas.height;
      }

      scratchCtx.clearRect(0, 0, scratchCanvas.width, scratchCanvas.height);
      scratchCtx.drawImage(ctx.canvas, 0, 0);

      const dpr = ctx.canvas.width / Math.max(1, width);
      const slices = glitchState.slices;

      for (let i = 0; i < slices.length; i += 1) {
        const s = slices[i];
        const sy = Math.floor(s.yFrac * scratchCanvas.height);
        const sh = Math.max(2, Math.floor(s.hFrac * scratchCanvas.height));
        const dx = Math.round(s.shift * dpr);

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, sy, ctx.canvas.width, sh);
        ctx.drawImage(
          scratchCanvas,
          0,
          sy,
          scratchCanvas.width,
          sh,
          dx,
          sy,
          ctx.canvas.width,
          sh
        );
        ctx.fillStyle = s.tint;
        ctx.fillRect(0, sy, ctx.canvas.width, Math.max(1, Math.floor(sh * 0.35)));
        ctx.restore();
      }
    }
  }
}

export function LoginVisualPanel() {
  const panelRef = useRef(null);
  const canvasRef = useRef(null);
  const pointerTargetRef = useRef({ x: 0, y: 0 });
  const pointerCurrentRef = useRef({ x: 0, y: 0 });
  const blobGlitchRef = useRef({ active: false, slices: [] });
  const [glitchVariant, setGlitchVariant] = useState(null);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let reduceMotion = motionQuery.matches;

    let glitchTimerId = null;
    let glitchClearId = null;

    const clearGlitchTimers = () => {
      if (glitchTimerId !== null) {
        window.clearTimeout(glitchTimerId);
        glitchTimerId = null;
      }
      if (glitchClearId !== null) {
        window.clearTimeout(glitchClearId);
        glitchClearId = null;
      }
    };

    const scheduleNextGlitch = () => {
      clearGlitchTimers();
      if (reduceMotion) return;

      const delay = 3800 + Math.random() * 4400;
      glitchTimerId = window.setTimeout(() => {
        if (!document.hidden && !reduceMotion) {
          const variant =
            GLITCH_VARIANTS[Math.floor(Math.random() * GLITCH_VARIANTS.length)];
          const duration = 150 + Math.random() * 130;

          if (variant === "blob-interference") {
            blobGlitchRef.current = {
              active: true,
              slices: [
                {
                  yFrac: 0.24 + Math.random() * 0.14,
                  hFrac: 0.025 + Math.random() * 0.02,
                  shift: (Math.random() > 0.5 ? 1 : -1) * (4 + Math.random() * 6),
                  tint: "rgba(180, 235, 220, 0.07)",
                },
                {
                  yFrac: 0.48 + Math.random() * 0.14,
                  hFrac: 0.02 + Math.random() * 0.025,
                  shift: (Math.random() > 0.5 ? 1 : -1) * (5 + Math.random() * 7),
                  tint: "rgba(255, 255, 255, 0.06)",
                },
                {
                  yFrac: 0.68 + Math.random() * 0.12,
                  hFrac: 0.018 + Math.random() * 0.018,
                  shift: (Math.random() > 0.5 ? 1 : -1) * (3 + Math.random() * 5),
                  tint: "rgba(235, 130, 120, 0.055)",
                },
              ],
            };
          }

          setGlitchVariant(variant);

          glitchClearId = window.setTimeout(() => {
            blobGlitchRef.current = { active: false, slices: [] };
            setGlitchVariant(null);
            scheduleNextGlitch();
          }, duration);
        } else {
          scheduleNextGlitch();
        }
      }, delay);
    };

    const handleMotionChange = (event) => {
      reduceMotion = event.matches;
      if (reduceMotion) {
        clearGlitchTimers();
        blobGlitchRef.current = { active: false, slices: [] };
        setGlitchVariant(null);
      } else {
        scheduleNextGlitch();
      }
    };

    if (!reduceMotion) {
      scheduleNextGlitch();
    }

    motionQuery.addEventListener("change", handleMotionChange);

    return () => {
      clearGlitchTimers();
      motionQuery.removeEventListener("change", handleMotionChange);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const scratchCanvas = document.createElement("canvas");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    let width = 320;
    let height = 320;
    let rafId = null;
    let startTime = performance.now();

    const updateCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const renderStaticFrame = () => {
      updateCanvasSize();
      drawObsidianBlob(
        ctx,
        width,
        height,
        1.2,
        { x: 0, y: 0 },
        { active: false, slices: [] },
        null
      );
    };

    const tick = (now) => {
      if (document.hidden || motionQuery.matches) {
        rafId = null;
        return;
      }

      const elapsed = (now - startTime) * 0.001;
      const cur = pointerCurrentRef.current;
      const tgt = pointerTargetRef.current;

      cur.x += (tgt.x - cur.x) * 0.065;
      cur.y += (tgt.y - cur.y) * 0.065;

      drawObsidianBlob(
        ctx,
        width,
        height,
        elapsed,
        cur,
        blobGlitchRef.current,
        scratchCanvas
      );

      rafId = window.requestAnimationFrame(tick);
    };

    const startLoop = () => {
      if (motionQuery.matches) {
        renderStaticFrame();
        return;
      }
      if (rafId === null && !document.hidden) {
        startTime = performance.now();
        rafId = window.requestAnimationFrame(tick);
      }
    };

    const stopLoop = () => {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
      if (motionQuery.matches) {
        renderStaticFrame();
      }
    });
    resizeObserver.observe(canvas);
    updateCanvasSize();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopLoop();
      } else {
        startLoop();
      }
    };

    const handleMotionChange = () => {
      stopLoop();
      if (motionQuery.matches) {
        renderStaticFrame();
      } else {
        startLoop();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    motionQuery.addEventListener("change", handleMotionChange);
    startLoop();

    return () => {
      stopLoop();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      motionQuery.removeEventListener("change", handleMotionChange);
    };
  }, []);

  const handlePointerMove = (event) => {
    const panel = panelRef.current;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    pointerTargetRef.current = {
      x: Math.max(-1, Math.min(1, nx)),
      y: Math.max(-1, Math.min(1, ny)),
    };
  };

  const handlePointerLeave = () => {
    pointerTargetRef.current = { x: 0, y: 0 };
  };

  const isSignalBars = glitchVariant === "signal-bars";
  const isLogoTear = glitchVariant === "logo-tear";
  const isBlobGlitch = glitchVariant === "blob-interference";

  return (
    <section
      ref={panelRef}
      className={styles.panel}
      aria-label="Identidade visual Mídia Sobrenatural"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      data-glitch={glitchVariant || "idle"}
    >
      <div className={styles.plusGrid} aria-hidden="true" />
      <div className={styles.ambientGlow} aria-hidden="true" />

      <div className={styles.stage}>
        <div className={styles.blobStage} aria-hidden="true">
          <div className={styles.blobFallback} />
          <canvas ref={canvasRef} className={styles.blobCanvas} />
        </div>

        <div
          className={`${styles.logoStage} ${
            isLogoTear ? styles.logoStageGlitch : ""
          }`}
        >
          <Image
            src="/brand/logo-midia-light.png"
            alt="Mídia Sobrenatural"
            width={684}
            height={302}
            priority
            className={styles.logoImage}
          />
          <span
            aria-hidden="true"
            className={`${styles.logoGlitchLayer} ${styles.logoGlitchLayerA} ${
              isLogoTear ? styles.logoGlitchActiveA : ""
            }`}
          />
          <span
            aria-hidden="true"
            className={`${styles.logoGlitchLayer} ${styles.logoGlitchLayerB} ${
              isLogoTear ? styles.logoGlitchActiveB : ""
            }`}
          />
        </div>
      </div>

      {/* Periodic restrained interference layers (WCAG 2.3.1 compliant) */}
      <div
        aria-hidden="true"
        className={`${styles.glitchOverlay} ${
          isSignalBars || isBlobGlitch ? styles.glitchOverlayActive : ""
        }`}
      >
        <span className={`${styles.glitchBar} ${styles.glitchBarOne}`} />
        <span className={`${styles.glitchBar} ${styles.glitchBarTwo}`} />
        <span className={`${styles.glitchBar} ${styles.glitchBarThree}`} />
        <span className={`${styles.glitchBar} ${styles.glitchBarFour}`} />
      </div>
    </section>
  );
}
