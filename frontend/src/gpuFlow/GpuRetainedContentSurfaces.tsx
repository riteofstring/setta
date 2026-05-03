import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";

import type { GpuHtmlSurfaceOverlayLayout } from "./htmlSurfaces/frame";
import {
  HTML_SURFACE_SOURCE_CLASS_NAME,
  HtmlSurfaceSourceLayer,
  type HtmlSurfaceSourceElementConfig,
} from "./htmlSurfaces/sourceLayer";
import type {
  GpuRetainedContentDrawCommand,
  GpuRetainedContentRowState,
  GpuRetainedContentScene,
} from "./retainedContentScene";
import type { GpuContentSurface } from "./scene";
import type { GpuRect } from "./viewportMath";

type GpuRetainedContentSurface = GpuContentSurface & {
  readonly retainedScene: GpuRetainedContentScene;
};

type GpuRetainedContentSurfaceLayerProps = {
  readonly onSurfaceDraw?: ((surfaceId: string) => void) | undefined;
  readonly onSurfaceElementChange?:
    | ((surfaceId: string, element: HTMLElement | null) => void)
    | undefined;
  readonly surfaces: readonly GpuContentSurface[] | undefined;
};

const GPU_RETAINED_CONTENT_SOURCE_CLASS_NAME =
  "setta-gpu-flow__retained-content-source";

const RETAINED_CONTENT_FONT =
  "12px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const RETAINED_CONTENT_CONTROL_FONT =
  "10px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

export function GpuRetainedContentSurfaceLayer({
  onSurfaceDraw,
  onSurfaceElementChange,
  surfaces,
}: GpuRetainedContentSurfaceLayerProps) {
  const retainedSurfaces = useMemo(
    () => getGpuRetainedContentSourceSurfaces(surfaces),
    [surfaces],
  );
  if (retainedSurfaces.length === 0) {
    return null;
  }
  return (
    <HtmlSurfaceSourceLayer
      configureSourceElement={configureGpuRetainedContentSourceElement}
      getSourceId={getGpuRetainedContentSurfaceId}
      onSourceElementChange={onSurfaceElementChange}
      renderSource={(surface) => (
        <GpuRetainedContentCanvas
          onSurfaceDraw={onSurfaceDraw}
          surface={surface}
        />
      )}
      sourceClassName={`${HTML_SURFACE_SOURCE_CLASS_NAME} ${GPU_RETAINED_CONTENT_SOURCE_CLASS_NAME}`}
      sources={retainedSurfaces}
    />
  );
}

export function getGpuRetainedContentSurfaceLayouts(
  surfaces: readonly GpuContentSurface[] | undefined,
): readonly GpuHtmlSurfaceOverlayLayout[] {
  return getGpuRetainedContentSourceSurfaces(surfaces).map(
    toGpuRetainedContentSurfaceLayout,
  );
}

export function toGpuRetainedContentSurfaceLayout(
  surface: GpuRetainedContentSurface,
): GpuHtmlSurfaceOverlayLayout {
  return {
    height: surface.rect.height,
    surfaceId: surface.id,
    width: surface.rect.width,
    x: surface.rect.x,
    y: surface.rect.y,
    zIndex: surface.zIndex,
  };
}

export function getGpuRetainedContentSourceStyle(
  surface: GpuRetainedContentSurface,
): CSSProperties {
  return {
    height: surface.rect.height,
    width: surface.rect.width,
  };
}

function GpuRetainedContentCanvas({
  onSurfaceDraw,
  surface,
}: {
  readonly onSurfaceDraw?: ((surfaceId: string) => void) | undefined;
  readonly surface: GpuRetainedContentSurface;
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
    prepareGpuRetainedContentCanvas(canvas, surface);
    drawGpuRetainedContentSurface(ctx, surface);
    onSurfaceDraw?.(surface.id);
  }, [onSurfaceDraw, surface]);

  return (
    <canvas
      aria-hidden="true"
      data-gpu-flow-retained-content-canvas="true"
      data-gpu-flow-retained-content-id={surface.id}
      ref={canvasRef}
      style={getGpuRetainedContentCanvasStyle(surface)}
    />
  );
}

export function drawGpuRetainedContentSurface(
  ctx: CanvasRenderingContext2D,
  surface: GpuRetainedContentSurface,
) {
  const scene = surface.retainedScene;
  const width = Math.max(0, surface.rect.width);
  const height = Math.max(0, surface.rect.height);
  const rowStateById = new Map(scene.rows.map((row) => [row.id, row.state]));

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.clip();
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, width, height);

  for (const command of scene.drawCommands) {
    drawGpuRetainedContentCommand({
      command,
      ctx,
      rowState: rowStateById.get(command.rowId),
    });
  }
  drawGpuRetainedContentPortAnchors(ctx, scene);
  ctx.restore();
}

function drawGpuRetainedContentCommand({
  command,
  ctx,
  rowState,
}: {
  readonly command: GpuRetainedContentDrawCommand;
  readonly ctx: CanvasRenderingContext2D;
  readonly rowState: GpuRetainedContentRowState | undefined;
}) {
  if (command.kind === "row-background") {
    drawGpuRetainedContentRowBackground(ctx, command.rect, command.state);
    return;
  }
  if (command.kind === "nest-guide") {
    drawGpuRetainedContentNestGuide(ctx, command.rect);
    return;
  }
  if (command.kind === "row-drop-marker") {
    drawGpuRetainedContentDropMarker(ctx, command.rect);
    return;
  }
  if (command.kind === "row-drag-preview") {
    drawGpuRetainedContentDragPreview({
      ctx,
      rect: command.rect,
      rowCount: command.rowCount,
      text: command.text,
    });
    return;
  }
  if (command.kind === "row-label") {
    drawGpuRetainedContentLabel({
      ctx,
      rect: command.rect,
      state: rowState,
      text: command.text,
    });
    return;
  }
  drawGpuRetainedContentControl({
    controlKind: command.controlKind,
    ctx,
    rect: command.rect,
    state: rowState,
  });
}

function drawGpuRetainedContentRowBackground(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
  state: GpuRetainedContentRowState,
) {
  ctx.fillStyle = getGpuRetainedContentRowBackgroundColor(state);
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  if (state.focused) {
    ctx.strokeStyle = "#0284c7";
    ctx.lineWidth = 1;
    strokeInsetRect(ctx, rect, 0.5);
  }
  if (state.error) {
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(rect.x, rect.y, 3, rect.height);
  }
}

function drawGpuRetainedContentNestGuide(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
) {
  ctx.fillStyle = "#cbd5e1";
  ctx.fillRect(rect.x, rect.y + 4, rect.width, Math.max(0, rect.height - 8));
}

function drawGpuRetainedContentLabel({
  ctx,
  rect,
  state,
  text,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
  readonly text: string;
}) {
  ctx.font = RETAINED_CONTENT_FONT;
  ctx.textBaseline = "middle";
  ctx.fillStyle = state?.disabled ? "#94a3b8" : "#0f172a";
  const paddingX = 8;
  ctx.fillText(
    text,
    rect.x + paddingX,
    rect.y + rect.height / 2,
    Math.max(0, rect.width - paddingX * 2),
  );
}

function drawGpuRetainedContentControl({
  controlKind,
  ctx,
  rect,
  state,
}: {
  readonly controlKind: string;
  readonly ctx: CanvasRenderingContext2D;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  const outer = insetRect(rect, 6, 5);
  ctx.fillStyle = state?.disabled ? "#e2e8f0" : "#e0f2fe";
  ctx.strokeStyle = state?.selected ? "#2563eb" : "#bae6fd";
  ctx.lineWidth = 1;
  fillRoundRect(ctx, outer, 5);
  strokeRoundRect(ctx, outer, 5);
  ctx.font = RETAINED_CONTENT_CONTROL_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = state?.disabled ? "#64748b" : "#075985";
  ctx.fillText(
    controlKind,
    outer.x + outer.width / 2,
    outer.y + outer.height / 2,
    Math.max(0, outer.width - 8),
  );
  ctx.textAlign = "start";
}

function drawGpuRetainedContentPortAnchors(
  ctx: CanvasRenderingContext2D,
  scene: GpuRetainedContentScene,
) {
  for (const anchor of scene.portAnchors) {
    ctx.beginPath();
    ctx.arc(anchor.localPosition.x, anchor.localPosition.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = anchor.kind === "input" ? "#2563eb" : "#f97316";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

function getGpuRetainedContentRowBackgroundColor(
  state: GpuRetainedContentRowState,
): string {
  if (state.error) {
    return "#fef2f2";
  }
  if (state.dragging) {
    return "#e2e8f0";
  }
  if (state.selected) {
    return "#dbeafe";
  }
  if (state.focused) {
    return "#e0f2fe";
  }
  if (state.hovered) {
    return "#eff6ff";
  }
  return "#f8fafc";
}

function drawGpuRetainedContentDropMarker(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
) {
  ctx.fillStyle = "#2563eb";
  fillRoundRect(ctx, rect, Math.min(2, rect.height / 2));
}

function drawGpuRetainedContentDragPreview({
  ctx,
  rect,
  rowCount,
  text,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly rect: GpuRect;
  readonly rowCount: number;
  readonly text: string;
}) {
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 1;
  fillRoundRect(ctx, rect, 5);
  strokeRoundRect(ctx, rect, 5);
  ctx.globalAlpha = 1;
  ctx.font = RETAINED_CONTENT_FONT;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0f172a";
  const suffix = rowCount > 1 ? ` (${rowCount})` : "";
  ctx.fillText(
    `${text}${suffix}`,
    rect.x + 8,
    rect.y + rect.height / 2,
    Math.max(0, rect.width - 16),
  );
  ctx.restore();
}

function configureGpuRetainedContentSourceElement({
  host,
  source,
}: HtmlSurfaceSourceElementConfig<GpuRetainedContentSurface>) {
  host.dataset.gpuFlowRetainedContentSource = "true";
  host.dataset.ownerSectionId = source.ownerSectionId;
  host.setAttribute("data-testid", `gpu-retained-content-source-${source.id}`);
  const style = getGpuRetainedContentSourceStyle(source);
  host.style.height = `${style.height}px`;
  host.style.overflow = "hidden";
  host.style.width = `${style.width}px`;
}

function getGpuRetainedContentSurfaceId(
  surface: GpuRetainedContentSurface,
): string {
  return surface.id;
}

function getGpuRetainedContentSourceSurfaces(
  surfaces: readonly GpuContentSurface[] | undefined,
): readonly GpuRetainedContentSurface[] {
  return (surfaces ?? []).filter(isGpuRetainedContentSurface);
}

function isGpuRetainedContentSurface(
  surface: GpuContentSurface,
): surface is GpuRetainedContentSurface {
  return (
    surface.renderer.kind === "canvas-content" &&
    Boolean(surface.retainedScene) &&
    surface.rect.width > 0 &&
    surface.rect.height > 0
  );
}

function prepareGpuRetainedContentCanvas(
  canvas: HTMLCanvasElement,
  surface: GpuRetainedContentSurface,
) {
  const dpr = getGpuRetainedContentDevicePixelRatio();
  const cssWidth = Math.max(0, surface.rect.width);
  const cssHeight = Math.max(0, surface.rect.height);
  const pixelWidth = Math.max(1, Math.ceil(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.ceil(cssHeight * dpr));
  if (canvas.width !== pixelWidth) {
    canvas.width = pixelWidth;
  }
  if (canvas.height !== pixelHeight) {
    canvas.height = pixelHeight;
  }
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  const ctx = canvas.getContext("2d");
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function getGpuRetainedContentCanvasStyle(
  surface: GpuRetainedContentSurface,
): CSSProperties {
  return {
    display: "block",
    height: surface.rect.height,
    width: surface.rect.width,
  };
}

function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
  radius: number,
) {
  createRoundRectPath(ctx, rect, radius);
  ctx.fill();
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
  radius: number,
) {
  createRoundRectPath(ctx, rect, radius);
  ctx.stroke();
}

function createRoundRectPath(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
  radius: number,
) {
  const clampedRadius = Math.max(
    0,
    Math.min(radius, rect.width / 2, rect.height / 2),
  );
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  ctx.beginPath();
  ctx.moveTo(rect.x + clampedRadius, rect.y);
  ctx.lineTo(right - clampedRadius, rect.y);
  ctx.quadraticCurveTo(right, rect.y, right, rect.y + clampedRadius);
  ctx.lineTo(right, bottom - clampedRadius);
  ctx.quadraticCurveTo(right, bottom, right - clampedRadius, bottom);
  ctx.lineTo(rect.x + clampedRadius, bottom);
  ctx.quadraticCurveTo(rect.x, bottom, rect.x, bottom - clampedRadius);
  ctx.lineTo(rect.x, rect.y + clampedRadius);
  ctx.quadraticCurveTo(rect.x, rect.y, rect.x + clampedRadius, rect.y);
  ctx.closePath();
}

function strokeInsetRect(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
  inset: number,
) {
  ctx.strokeRect(
    rect.x + inset,
    rect.y + inset,
    Math.max(0, rect.width - inset * 2),
    Math.max(0, rect.height - inset * 2),
  );
}

function insetRect(rect: GpuRect, x: number, y: number): GpuRect {
  return {
    height: Math.max(0, rect.height - y * 2),
    width: Math.max(0, rect.width - x * 2),
    x: rect.x + x,
    y: rect.y + y,
  };
}

function getGpuRetainedContentDevicePixelRatio(): number {
  return Math.max(1, globalThis.devicePixelRatio || 1);
}
