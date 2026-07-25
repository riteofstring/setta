import { useEffect, useRef } from "react";

import type { PrototypeMetricsCollector } from "../prototype-metrics";
import type { ThinkingBackdropVariant } from "../prototype-types";

const backingScale = 0.34;
const maximumBackingWidth = 512;
const maximumBackingHeight = 320;

const statusPhrases = [
  "Reviewing context",
  "Checking dependencies",
  "Organizing response",
  "Preparing next step",
  "Verifying result",
  "Updating preview",
] as const;

interface BackdropPalette {
  accent: string;
  background: string;
  font: string;
  foreground: string;
  muted: string;
  secondary: string;
  surface: string;
}

export interface ThinkingBackdropPrototypeProps {
  metrics: PrototypeMetricsCollector;
  variant: ThinkingBackdropVariant;
}

export function ThinkingBackdropPrototype({ metrics, variant }: ThinkingBackdropPrototypeProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const metricsRef = useRef(metrics);

  useEffect(() => {
    metricsRef.current = metrics;
  }, [metrics]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const root = document.documentElement;
    let observedHeight = -1;
    let observedWidth = -1;
    let redrawFrame = 0;
    let themeSignature = "";

    const redraw = (force = false) => {
      const bounds = canvas.getBoundingClientRect();
      const cssWidth = Math.max(0, bounds.width);
      const cssHeight = Math.max(0, bounds.height);
      if (cssWidth === 0 || cssHeight === 0) {
        return;
      }

      const scale = Math.min(
        backingScale,
        maximumBackingWidth / cssWidth,
        maximumBackingHeight / cssHeight,
      );
      const backingWidth = Math.max(1, Math.round(cssWidth * scale));
      const backingHeight = Math.max(1, Math.round(cssHeight * scale));
      const nextThemeSignature = readThemeSignature(root);
      const sizeChanged = backingWidth !== observedWidth || backingHeight !== observedHeight;
      const themeChanged = nextThemeSignature !== themeSignature;
      if (!force && !sizeChanged && !themeChanged) {
        return;
      }

      if (sizeChanged) {
        canvas.width = backingWidth;
        canvas.height = backingHeight;
        observedWidth = backingWidth;
        observedHeight = backingHeight;
        metricsRef.current.recordResize(
          backingWidth,
          backingHeight,
          Math.min(backingWidth / cssWidth, backingHeight / cssHeight),
        );
      }
      themeSignature = nextThemeSignature;

      const context = canvas.getContext("2d", { alpha: true });
      if (!context) {
        throw new Error("Thinking backdrop canvas rendering is unavailable.");
      }
      drawBackdrop(context, backingWidth, backingHeight, variant, readPalette(root));
      metricsRef.current.recordDraw();
    };

    const scheduleRedraw = () => {
      if (redrawFrame !== 0) {
        return;
      }
      redrawFrame = window.requestAnimationFrame(() => {
        redrawFrame = 0;
        redraw();
      });
    };

    redraw(true);

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleRedraw);
    resizeObserver?.observe(canvas);

    const themeObserver =
      typeof MutationObserver === "undefined" ? null : new MutationObserver(scheduleRedraw);
    themeObserver?.observe(root, {
      attributeFilter: ["class", "data-color-mode", "style"],
      attributes: true,
    });

    return () => {
      if (redrawFrame !== 0) {
        window.cancelAnimationFrame(redrawFrame);
      }
      resizeObserver?.disconnect();
      themeObserver?.disconnect();
    };
  }, [variant]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={`prototype-thinking-backdrop prototype-thinking-backdrop--${variant}`}
      data-variant={variant}
      tabIndex={-1}
    />
  );
}

function drawBackdrop(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  variant: ThinkingBackdropVariant,
  palette: BackdropPalette,
): void {
  context.clearRect(0, 0, width, height);
  context.save();
  context.textBaseline = "middle";

  switch (variant) {
    case "raster-echo":
      drawRasterEcho(context, width, height, palette);
      break;
    case "redacted-stream":
      drawRedactedStream(context, width, height, palette);
      break;
    case "peripheral-chorus":
      drawPeripheralChorus(context, width, height, palette);
      break;
    case "scanline-palimpsest":
      drawScanlinePalimpsest(context, width, height, palette);
      break;
    default:
      variant satisfies never;
  }

  context.restore();
}

function drawRasterEcho(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: BackdropPalette,
): void {
  context.fillStyle = palette.background;
  context.fillRect(0, 0, width, height);
  context.font = `700 ${Math.max(18, Math.round(height * 0.19))}px ${palette.font}`;
  context.globalAlpha = 0.12;
  context.fillStyle = palette.foreground;
  context.fillText(statusPhrases[0], -width * 0.08, height * 0.24);
  context.fillText(statusPhrases[2], width * 0.12, height * 0.54);
  context.fillText(statusPhrases[4], -width * 0.02, height * 0.84);

  context.globalAlpha = 0.2;
  context.fillStyle = palette.accent;
  context.fillRect(width * 0.12, height * 0.39, width * 0.43, Math.max(2, height * 0.016));
  context.fillRect(width * 0.58, height * 0.68, width * 0.26, Math.max(2, height * 0.012));
}

function drawRedactedStream(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: BackdropPalette,
): void {
  context.fillStyle = palette.background;
  context.fillRect(0, 0, width, height);
  context.font = `500 ${Math.max(7, Math.round(height * 0.045))}px ${palette.font}`;

  const rowHeight = height / 8;
  for (let row = 0; row < 8; row += 1) {
    const y = rowHeight * (row + 0.7);
    context.globalAlpha = row % 2 === 0 ? 0.2 : 0.12;
    context.fillStyle = row % 3 === 0 ? palette.secondary : palette.muted;
    context.fillText(statusPhraseAt(row), width * 0.08, y);

    context.globalAlpha = 0.82;
    context.fillStyle = palette.surface;
    const offset = ((row * 31) % 47) / 100;
    context.fillRect(width * (0.23 + offset), y - rowHeight * 0.22, width * 0.24, rowHeight * 0.42);
    context.fillRect(
      width * (0.61 - offset * 0.3),
      y - rowHeight * 0.22,
      width * 0.17,
      rowHeight * 0.42,
    );
  }
}

function drawPeripheralChorus(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: BackdropPalette,
): void {
  context.fillStyle = palette.background;
  context.fillRect(0, 0, width, height);
  context.font = `600 ${Math.max(9, Math.round(height * 0.065))}px ${palette.font}`;
  context.globalAlpha = 0.16;
  context.fillStyle = palette.foreground;

  context.save();
  context.beginPath();
  context.rect(0, 0, width, height * 0.18);
  context.rect(0, height * 0.82, width, height * 0.18);
  context.rect(0, height * 0.18, width * 0.2, height * 0.64);
  context.rect(width * 0.8, height * 0.18, width * 0.2, height * 0.64);
  context.clip();
  context.fillText(statusPhrases[0], width * 0.04, height * 0.1);
  context.fillText(statusPhrases[1], width * 0.67, height * 0.23);
  context.fillText(statusPhrases[3], -width * 0.1, height * 0.56);
  context.fillText(statusPhrases[4], width * 0.7, height * 0.76);
  context.fillText(statusPhrases[5], width * 0.18, height * 0.91);
  context.restore();

  const glow = context.createRadialGradient(
    width * 0.5,
    height * 0.5,
    0,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.48,
  );
  glow.addColorStop(0, palette.background);
  glow.addColorStop(0.58, palette.background);
  glow.addColorStop(1, "transparent");
  context.globalAlpha = 0.9;
  context.fillStyle = glow;
  context.fillRect(0, 0, width, height);
}

function drawScanlinePalimpsest(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: BackdropPalette,
): void {
  context.fillStyle = palette.background;
  context.fillRect(0, 0, width, height);
  context.font = `700 ${Math.max(10, Math.round(height * 0.08))}px ${palette.font}`;

  for (let layer = 0; layer < 5; layer += 1) {
    context.globalAlpha = 0.06 + layer * 0.018;
    context.fillStyle = layer % 2 === 0 ? palette.foreground : palette.secondary;
    context.fillText(
      statusPhraseAt(layer + 1),
      width * (0.03 + layer * 0.035),
      height * (0.2 + layer * 0.15),
    );
  }

  context.globalAlpha = 0.18;
  context.fillStyle = palette.surface;
  for (let y = 0; y < height; y += 4) {
    context.fillRect(0, y, width, 1);
  }

  context.globalAlpha = 0.16;
  context.fillStyle = palette.accent;
  for (let index = 0; index < 44; index += 1) {
    const x = (index * 73) % width;
    const y = (index * 41) % height;
    context.fillRect(x, y, index % 3 === 0 ? 2 : 1, 1);
  }
}

function statusPhraseAt(index: number): string {
  return statusPhrases[index % statusPhrases.length] ?? statusPhrases[0];
}

function readPalette(root: HTMLElement): BackdropPalette {
  const probe = root.ownerDocument.createElement("span");
  probe.ariaHidden = "true";
  probe.style.cssText = "position:fixed;pointer-events:none;visibility:hidden";
  (root.ownerDocument.body ?? root).appendChild(probe);

  const styles = getComputedStyle(root);
  try {
    return {
      accent: resolveCssColor(probe, "--accent-cyan", "oklch(0.846 0.129 213.38)"),
      background: resolveCssColor(probe, "--workspace-surface", "oklch(0.18 0.015 255)"),
      font: styles.getPropertyValue("--font-mono").trim() || "ui-monospace, monospace",
      foreground: resolveCssColor(probe, "--foreground", "oklch(0.92 0.008 255)"),
      muted: resolveCssColor(probe, "--muted-foreground", "oklch(0.68 0.018 255)"),
      secondary: resolveCssColor(probe, "--accent-violet", "oklch(0.76 0.125 290)"),
      surface: resolveCssColor(probe, "--workspace-pane-surface", "oklch(0.22 0.015 255)"),
    };
  } finally {
    probe.remove();
  }
}

function readThemeSignature(root: HTMLElement): string {
  const styles = getComputedStyle(root);
  return [
    root.dataset.colorMode ?? "",
    root.classList.contains("dark") ? "dark" : "light",
    styles.getPropertyValue("--workspace-surface"),
    styles.getPropertyValue("--workspace-pane-surface"),
    styles.getPropertyValue("--foreground"),
    styles.getPropertyValue("--muted-foreground"),
    styles.getPropertyValue("--accent-cyan"),
    styles.getPropertyValue("--accent-violet"),
    styles.getPropertyValue("--font-mono"),
  ].join("|");
}

function resolveCssColor(probe: HTMLElement, property: string, fallback: string): string {
  probe.style.color = `var(${property}, ${fallback})`;
  return getComputedStyle(probe).color;
}
