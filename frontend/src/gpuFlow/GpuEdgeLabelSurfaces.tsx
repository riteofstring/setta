import { useLayoutEffect, useRef, type CSSProperties } from "react";

import type { GpuEdgeSceneLabel } from "./edges/edgeSources";
import type { GpuHtmlSurfaceOverlayLayout } from "./htmlSurfaces/frame";
import {
  HTML_SURFACE_SOURCE_CLASS_NAME,
  HtmlSurfaceSourceLayer,
  type HtmlSurfaceSourceElementConfig,
} from "./htmlSurfaces/sourceLayer";

const GPU_EDGE_LABEL_SOURCE_CLASS_NAME = "setta-gpu-flow__edge-label-source";

export function GpuEdgeLabelSurfaceLayer({
  labels,
  onLabelDraw,
  onLabelElementChange,
}: {
  readonly labels: readonly GpuEdgeSceneLabel[];
  readonly onLabelDraw?: ((surfaceId: string) => void) | undefined;
  readonly onLabelElementChange?:
    | ((surfaceId: string, element: HTMLElement | null) => void)
    | undefined;
}) {
  if (labels.length === 0) {
    return null;
  }
  return (
    <HtmlSurfaceSourceLayer
      configureSourceElement={configureGpuEdgeLabelSourceElement}
      getSourceId={getGpuEdgeLabelSurfaceId}
      onSourceElementChange={onLabelElementChange}
      renderSource={(label) => (
        <GpuEdgeLabelCanvas label={label} onLabelDraw={onLabelDraw} />
      )}
      sourceClassName={`${HTML_SURFACE_SOURCE_CLASS_NAME} ${GPU_EDGE_LABEL_SOURCE_CLASS_NAME}`}
      sources={labels}
    />
  );
}

export function getGpuEdgeLabelSurfaceLayouts(
  labels: readonly GpuEdgeSceneLabel[] | undefined,
): readonly GpuHtmlSurfaceOverlayLayout[] {
  return (labels ?? []).map(toGpuEdgeLabelSurfaceLayout);
}

export function toGpuEdgeLabelSurfaceLayout(
  label: GpuEdgeSceneLabel,
): GpuHtmlSurfaceOverlayLayout {
  return {
    actorKind: "edge-label",
    height: label.height,
    surfaceId: getGpuEdgeLabelSurfaceId(label),
    width: label.width,
    x: label.x - label.width / 2,
    y: label.y - label.height / 2,
    zIndex: label.zIndex,
  };
}

function getGpuEdgeLabelSurfaceId(label: GpuEdgeSceneLabel): string {
  return label.id;
}

export function getGpuEdgeLabelSourceStyle(
  label: GpuEdgeSceneLabel,
): CSSProperties {
  return {
    height: label.height,
    width: label.width,
  };
}

function configureGpuEdgeLabelSourceElement({
  host,
  source,
}: HtmlSurfaceSourceElementConfig<GpuEdgeSceneLabel>) {
  host.dataset.gpuFlowEdgeLabelSource = "true";
  host.dataset.edgeid = source.edgeId;
  host.setAttribute("data-testid", `gpu-edge-label-source-${source.id}`);
  const style = getGpuEdgeLabelSourceStyle(source);
  host.style.height = `${style.height}px`;
  host.style.width = `${style.width}px`;
}

function GpuEdgeLabelCanvas({
  label,
  onLabelDraw,
}: {
  readonly label: GpuEdgeSceneLabel;
  readonly onLabelDraw?: ((surfaceId: string) => void) | undefined;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    prepareGpuEdgeLabelCanvas(canvas, ctx, label);
    drawGpuEdgeLabelCanvas(ctx, label, {
      darkMode: isGpuEdgeLabelDarkMode(canvas),
    });
    onLabelDraw?.(label.id);
  }, [label, onLabelDraw]);

  return (
    <canvas
      aria-hidden="true"
      data-edgeid={label.edgeId}
      data-gpu-flow-edge-label-canvas="true"
      data-gpu-flow-edge-label-id={label.id}
      data-testid={`gpu-edge-label-canvas-${label.id}`}
      height={Math.max(1, Math.ceil(label.height))}
      ref={canvasRef}
      style={getGpuEdgeLabelCanvasStyle(label)}
      width={Math.max(1, Math.ceil(label.width))}
    />
  );
}

export function drawGpuEdgeLabelCanvas(
  ctx: CanvasRenderingContext2D,
  label: GpuEdgeSceneLabel,
  { darkMode }: { readonly darkMode: boolean },
) {
  const palette = getGpuEdgeLabelCanvasPalette(label.kind, darkMode);
  const width = Math.max(0, label.width);
  const height = Math.max(0, label.height);
  const radius = label.kind === "workflow-source-activation" ? height / 2 : 4;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.background;
  drawGpuEdgeLabelRoundRect(ctx, {
    height,
    radius,
    width,
    x: 0,
    y: 0,
  });
  ctx.fill();
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  drawGpuEdgeLabelRoundRect(ctx, {
    height: Math.max(0, height - 1),
    radius: Math.max(0, radius - 0.5),
    width: Math.max(0, width - 1),
    x: 0.5,
    y: 0.5,
  });
  ctx.stroke();
  ctx.fillStyle = palette.text;
  ctx.font =
    "600 10px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label.text, width / 2, height / 2);
  ctx.restore();
}

function prepareGpuEdgeLabelCanvas(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  label: GpuEdgeSceneLabel,
) {
  const dpr = getGpuEdgeLabelDevicePixelRatio(canvas);
  canvas.width = Math.max(1, Math.ceil(label.width * dpr));
  canvas.height = Math.max(1, Math.ceil(label.height * dpr));
  canvas.style.width = `${label.width}px`;
  canvas.style.height = `${label.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getGpuEdgeLabelCanvasStyle(label: GpuEdgeSceneLabel): CSSProperties {
  return {
    display: "block",
    height: label.height,
    width: label.width,
  };
}

function getGpuEdgeLabelDevicePixelRatio(canvas: HTMLCanvasElement): number {
  const ownerWindow = canvas.ownerDocument.defaultView;
  const dpr = ownerWindow?.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1;
  return Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
}

function isGpuEdgeLabelDarkMode(canvas: HTMLCanvasElement): boolean {
  return Boolean(
    canvas.closest(".dark") ??
      canvas.ownerDocument.documentElement.closest(".dark"),
  );
}

function getGpuEdgeLabelCanvasPalette(
  kind: GpuEdgeSceneLabel["kind"],
  darkMode: boolean,
): {
  readonly background: string;
  readonly border: string;
  readonly text: string;
} {
  if (kind === "workflow-source-activation") {
    return darkMode
      ? {
          background: "rgb(58, 47, 33)",
          border: "rgba(245, 158, 11, 0.45)",
          text: "rgb(253, 230, 138)",
        }
      : {
          background: "rgb(253, 245, 231)",
          border: "rgba(217, 119, 6, 0.35)",
          text: "rgb(120, 53, 15)",
        };
  }
  return darkMode
    ? {
        background: "rgb(41, 49, 65)",
        border: "rgba(148, 163, 184, 0.35)",
        text: "rgb(226, 232, 240)",
      }
    : {
        background: "rgb(235, 237, 240)",
        border: "rgba(100, 116, 139, 0.32)",
        text: "rgb(51, 65, 85)",
      };
}

function drawGpuEdgeLabelRoundRect(
  ctx: CanvasRenderingContext2D,
  rect: {
    readonly height: number;
    readonly radius: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  },
) {
  const radius = Math.min(rect.radius, rect.width / 2, rect.height / 2);
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  ctx.beginPath();
  ctx.moveTo(rect.x + radius, rect.y);
  ctx.lineTo(right - radius, rect.y);
  ctx.quadraticCurveTo(right, rect.y, right, rect.y + radius);
  ctx.lineTo(right, bottom - radius);
  ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
  ctx.lineTo(rect.x + radius, bottom);
  ctx.quadraticCurveTo(rect.x, bottom, rect.x, bottom - radius);
  ctx.lineTo(rect.x, rect.y + radius);
  ctx.quadraticCurveTo(rect.x, rect.y, rect.x + radius, rect.y);
  ctx.closePath();
}
