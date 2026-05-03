import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";

import {
  cancelGpuAnimationFrame,
  requestGpuAnimationFrame,
} from "./animationFrame";
import type { GpuHtmlSurfaceOverlayLayout } from "./htmlSurfaces/frame";
import {
  HTML_SURFACE_SOURCE_CLASS_NAME,
  HtmlSurfaceSourceLayer,
  type HtmlSurfaceSourceElementConfig,
} from "./htmlSurfaces/sourceLayer";
import { drawGpuRetainedContentButtonControl } from "./retainedContentButtonCanvas";
import { fillRoundRect, strokeRoundRect } from "./retainedContentCanvasDrawing";
import {
  getGpuRetainedContentCanvasPalette,
  isGpuRetainedContentCanvasDarkMode,
  type GpuRetainedContentCanvasPalette,
} from "./retainedContentCanvasTheme";
import {
  drawGpuRetainedContentColorPickerControl,
  drawGpuRetainedContentColorPickerPopupOption,
  drawGpuRetainedContentControlPopupBackground,
} from "./retainedContentColorPickerCanvas";
import {
  drawGpuRetainedContentDateCalendarCell,
  drawGpuRetainedContentDateCalendarHeader,
  drawGpuRetainedContentDateCalendarNavigation,
  drawGpuRetainedContentDateCalendarSummary,
  drawGpuRetainedContentDateCalendarWeekday,
} from "./retainedContentDateCalendarPopupCanvas";
import { drawGpuRetainedContentDateTimeControl } from "./retainedContentDateTimeCanvas";
import {
  drawGpuRetainedContentDropdownControl,
  drawGpuRetainedContentDropdownPopupOption,
} from "./retainedContentDropdownCanvas";
import { drawGpuRetainedContentDropzoneControl } from "./retainedContentDropzoneCanvas";
import { drawGpuRetainedContentPasswordControl } from "./retainedContentPasswordCanvas";
import {
  drawGpuRetainedContentRotaryControl,
  drawGpuRetainedContentSliderControl,
} from "./retainedContentRangedCanvas";
import {
  drawGpuRetainedContentLabel,
  drawGpuRetainedContentNestGuide,
  drawGpuRetainedContentRowBackground,
} from "./retainedContentRowCanvas";
import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentDrawCommand,
  GpuRetainedContentRowState,
  GpuRetainedContentScene,
} from "./retainedContentScene";
import { drawGpuRetainedContentScrollbar } from "./retainedContentScrollbarCanvas";
import {
  drawGpuRetainedContentStatusBadge,
  drawGpuRetainedContentStatusOverlay,
} from "./retainedContentStatusCanvas";
import type { GpuRetainedContentSwitchAnimationStore } from "./retainedContentSwitchAnimation";
import { drawGpuRetainedContentSwitchControl } from "./retainedContentSwitchCanvas";
import { drawGpuRetainedContentTextLikeControl } from "./retainedContentTextLikeCanvas";
import type { GpuContentSurface } from "./scene";
import type { GpuPoint, GpuRect } from "./viewportMath";

type GpuRetainedContentSurface = GpuContentSurface & {
  readonly retainedScene: GpuRetainedContentScene;
};

type GpuRetainedContentSourceSurface = GpuRetainedContentSurface & {
  readonly sourceClipOffset: GpuPoint;
};

type GpuRetainedContentSurfaceLayerProps = {
  readonly onSurfaceDraw?:
    | ((surfaceId: string, event: GpuRetainedContentSurfaceDrawEvent) => void)
    | undefined;
  readonly onSurfaceElementChange?:
    | ((surfaceId: string, element: HTMLElement | null) => void)
    | undefined;
  readonly surfaces: readonly GpuContentSurface[] | undefined;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
};

export type GpuRetainedContentSurfaceDrawEvent = {
  readonly reason: "animation" | "content";
  readonly sourceRect?: GpuRect | undefined;
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
  switchAnimations,
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
          switchAnimations={switchAnimations}
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

function toGpuRetainedContentSurfaceLayout(
  surface: GpuRetainedContentSourceSurface,
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
  const sourceSurface = clipGpuRetainedContentSourceSurface(surface);
  return {
    height: sourceSurface?.rect.height ?? 0,
    width: sourceSurface?.rect.width ?? 0,
  };
}

export function redrawGpuRetainedContentSourceElement({
  element,
  nowMs,
  surface,
  switchAnimations,
}: {
  readonly element: HTMLElement;
  readonly nowMs?: number | undefined;
  readonly surface: GpuContentSurface;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
}): boolean {
  if (!isGpuRetainedContentSurface(surface)) {
    return false;
  }
  const sourceSurface = clipGpuRetainedContentSourceSurface(surface);
  if (!sourceSurface) {
    return false;
  }
  const canvas = element.querySelector<HTMLCanvasElement>(
    '[data-gpu-flow-retained-content-canvas="true"]',
  );
  if (!canvas) {
    return false;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return false;
  }
  drawGpuRetainedContentSourceCanvas({
    canvas,
    ctx,
    nowMs,
    sourceSurface,
    switchAnimations,
  });
  return true;
}

function GpuRetainedContentCanvas({
  onSurfaceDraw,
  surface,
  switchAnimations,
}: {
  readonly onSurfaceDraw?:
    | ((surfaceId: string, event: GpuRetainedContentSurfaceDrawEvent) => void)
    | undefined;
  readonly surface: GpuRetainedContentSourceSurface;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    return () => {
      switchAnimations?.clearSurface(surface.id);
    };
  }, [surface.id, switchAnimations]);

  useLayoutEffect(() => {
    const cancelPendingAnimationFrame = () => {
      const frameId = animationFrameRef.current;
      if (frameId === null) {
        return;
      }
      cancelGpuAnimationFrame(frameId);
      animationFrameRef.current = null;
    };
    const canvas = canvasRef.current;
    if (!canvas) {
      cancelPendingAnimationFrame();
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      cancelPendingAnimationFrame();
      return;
    }
    const sourceSurface = clipGpuRetainedContentSourceSurface(surface);
    if (!sourceSurface) {
      cancelPendingAnimationFrame();
      return;
    }
    const drawSource = (
      nowMs: number,
      reason: GpuRetainedContentSurfaceDrawEvent["reason"],
    ) => {
      const sourceRect =
        reason === "animation"
          ? switchAnimations?.getActiveSurfaceSourceRect(sourceSurface)
          : undefined;
      drawGpuRetainedContentSourceCanvas({
        canvas,
        ctx,
        nowMs,
        sourceSurface,
        switchAnimations,
      });
      onSurfaceDraw?.(sourceSurface.id, {
        reason,
        ...(sourceRect ? { sourceRect } : {}),
      });
    };
    const scheduleAnimationFrame = () => {
      if (!switchAnimations || animationFrameRef.current !== null) {
        return;
      }
      animationFrameRef.current = requestGpuAnimationFrame((timestamp) => {
        animationFrameRef.current = null;
        drawSource(timestamp, "animation");
        if (switchAnimations.hasActiveSurface(sourceSurface.id, timestamp)) {
          scheduleAnimationFrame();
        }
      });
    };

    drawSource(getGpuRetainedContentSourceNowMs(), "content");
    if (switchAnimations?.hasActiveSurface(sourceSurface.id)) {
      scheduleAnimationFrame();
    }
    return cancelPendingAnimationFrame;
  }, [onSurfaceDraw, surface, switchAnimations]);

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

function drawGpuRetainedContentSurface(
  ctx: CanvasRenderingContext2D,
  surface: GpuRetainedContentSourceSurface,
  {
    nowMs,
    palette,
    switchAnimations,
  }: {
    readonly nowMs: number | undefined;
    readonly palette: GpuRetainedContentCanvasPalette;
    readonly switchAnimations?:
      | GpuRetainedContentSwitchAnimationStore
      | undefined;
  },
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
  ctx.fillStyle = palette.surfaceBackground;
  ctx.fillRect(0, 0, width, height);
  ctx.translate(-surface.sourceClipOffset.x, -surface.sourceClipOffset.y);

  for (const command of scene.drawCommands) {
    drawGpuRetainedContentCommand({
      command,
      ctx,
      nowMs,
      palette,
      rowState: rowStateById.get(command.rowId),
      surfaceId: surface.id,
      switchAnimations,
    });
  }
  drawGpuRetainedContentPortAnchors(ctx, scene);
  ctx.restore();
}

function drawGpuRetainedContentCommand({
  command,
  ctx,
  nowMs,
  palette,
  rowState,
  surfaceId,
  switchAnimations,
}: {
  readonly command: GpuRetainedContentDrawCommand;
  readonly ctx: CanvasRenderingContext2D;
  readonly nowMs: number | undefined;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly rowState: GpuRetainedContentRowState | undefined;
  readonly surfaceId: string;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
}) {
  if (
    drawGpuRetainedContentRowCommand({
      command,
      ctx,
      palette,
    })
  ) {
    return;
  }
  if (
    drawGpuRetainedContentPopupCommand({
      command,
      ctx,
    })
  ) {
    return;
  }
  if (command.kind === "row-label") {
    drawGpuRetainedContentLabel({
      appearance: command.appearance,
      ctx,
      palette,
      rect: command.rect,
      state: rowState,
      text: command.text,
    });
    return;
  }
  if (command.kind === "row-control") {
    drawGpuRetainedContentControl({
      control: command.control,
      controlKind: command.controlKind,
      ctx,
      nowMs,
      palette,
      rect: command.rect,
      rowId: command.rowId,
      state: rowState,
      surfaceId,
      switchAnimations,
    });
    return;
  }
  if (command.kind === "scrollbar") {
    drawGpuRetainedContentScrollbar({
      command,
      ctx,
      palette,
    });
  }
}

function drawGpuRetainedContentRowCommand({
  command,
  ctx,
  palette,
}: {
  readonly command: GpuRetainedContentDrawCommand;
  readonly ctx: CanvasRenderingContext2D;
  readonly palette: GpuRetainedContentCanvasPalette;
}): boolean {
  if (command.kind === "row-background") {
    drawGpuRetainedContentRowBackground({
      ctx,
      dividerRects: command.dividerRects,
      palette,
      rect: command.rect,
      state: command.state,
    });
    return true;
  }
  if (command.kind === "nest-guide") {
    drawGpuRetainedContentNestGuide(ctx, command.rect, palette);
    return true;
  }
  if (command.kind === "row-drop-marker") {
    drawGpuRetainedContentDropMarker(ctx, command.rect);
    return true;
  }
  if (command.kind === "row-drag-preview") {
    drawGpuRetainedContentDragPreview({
      ctx,
      rect: command.rect,
      rowCount: command.rowCount,
      text: command.text,
    });
    return true;
  }
  if (command.kind === "row-status-badge") {
    drawGpuRetainedContentStatusBadge({
      ctx,
      rect: command.rect,
    });
    return true;
  }
  if (command.kind === "row-status-overlay") {
    drawGpuRetainedContentStatusOverlay({
      ctx,
      rect: command.rect,
      status: command.status,
    });
    return true;
  }
  return false;
}

function drawGpuRetainedContentPopupCommand({
  command,
  ctx,
}: {
  readonly command: GpuRetainedContentDrawCommand;
  readonly ctx: CanvasRenderingContext2D;
}): boolean {
  if (command.kind === "control-popup-background") {
    drawGpuRetainedContentControlPopupBackground(ctx, command.rect);
    return true;
  }
  if (command.kind === "control-popup-option") {
    if ("color" in command.option) {
      drawGpuRetainedContentColorPickerPopupOption({
        ctx,
        highlighted: command.highlighted,
        option: command.option,
        rect: command.rect,
        selected: command.selected,
      });
      return true;
    }
    drawGpuRetainedContentDropdownPopupOption({
      ctx,
      highlighted: command.highlighted,
      option: command.option,
      rect: command.rect,
      selected: command.selected,
    });
    return true;
  }
  if (command.kind === "control-popup-date-calendar-header") {
    drawGpuRetainedContentDateCalendarHeader({
      ctx,
      monthTitle: command.monthTitle,
      rect: command.rect,
    });
    return true;
  }
  if (command.kind === "control-popup-date-calendar-navigation") {
    drawGpuRetainedContentDateCalendarNavigation({
      ctx,
      direction: command.direction,
      rect: command.rect,
    });
    return true;
  }
  if (command.kind === "control-popup-date-calendar-weekday") {
    drawGpuRetainedContentDateCalendarWeekday({
      ctx,
      rect: command.rect,
      text: command.text,
    });
    return true;
  }
  if (command.kind === "control-popup-date-calendar-cell") {
    drawGpuRetainedContentDateCalendarCell({
      cell: command.cell,
      ctx,
      highlighted: command.highlighted,
      rect: command.rect,
    });
    return true;
  }
  if (command.kind === "control-popup-date-calendar-summary") {
    drawGpuRetainedContentDateCalendarSummary({
      ctx,
      rect: command.rect,
      text: command.text,
    });
    return true;
  }
  return false;
}

function drawGpuRetainedContentControl({
  control,
  controlKind,
  ctx,
  nowMs,
  palette,
  rect,
  rowId,
  state,
  surfaceId,
  switchAnimations,
}: {
  readonly control: GpuRetainedContentControlDescriptor;
  readonly controlKind: string;
  readonly ctx: CanvasRenderingContext2D;
  readonly nowMs: number | undefined;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly rect: GpuRect;
  readonly rowId: string;
  readonly state: GpuRetainedContentRowState | undefined;
  readonly surfaceId: string;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
}) {
  if (
    drawGpuRetainedContentInputControl({
      control,
      ctx,
      nowMs,
      palette,
      rect,
      rowId,
      state,
      surfaceId,
      switchAnimations,
    })
  ) {
    return;
  }
  if (
    drawGpuRetainedContentPickerControl({
      control,
      ctx,
      palette,
      rect,
      state,
    })
  ) {
    return;
  }
  drawGpuRetainedContentGenericControl({
    controlKind,
    ctx,
    rect,
    state,
  });
}

function drawGpuRetainedContentInputControl({
  control,
  ctx,
  nowMs,
  palette,
  rect,
  rowId,
  state,
  surfaceId,
  switchAnimations,
}: {
  readonly control: GpuRetainedContentControlDescriptor;
  readonly ctx: CanvasRenderingContext2D;
  readonly nowMs: number | undefined;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly rect: GpuRect;
  readonly rowId: string;
  readonly state: GpuRetainedContentRowState | undefined;
  readonly surfaceId: string;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
}): boolean {
  switch (control.kind) {
    case "text-like":
      drawGpuRetainedContentTextLikeControl({
        control,
        ctx,
        palette,
        rect,
        state,
      });
      return true;
    case "button":
      drawGpuRetainedContentButtonControl({
        control,
        ctx,
        rect,
        state,
      });
      return true;
    case "switch":
      drawGpuRetainedContentSwitchControl({
        animationProgress: switchAnimations?.resolveProgress({
          checked: control.checked,
          ...(nowMs !== undefined ? { nowMs } : {}),
          rowId,
          surfaceId,
        }),
        control,
        ctx,
        palette,
        rect,
        state,
      });
      return true;
    case "slider":
      drawGpuRetainedContentSliderControl({
        control,
        ctx,
        rect,
        state,
      });
      return true;
    case "rotary":
      drawGpuRetainedContentRotaryControl({
        control,
        ctx,
        rect,
        state,
      });
      return true;
    default:
      return false;
  }
}

function drawGpuRetainedContentSourceCanvas({
  canvas,
  ctx,
  nowMs,
  sourceSurface,
  switchAnimations,
}: {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly nowMs?: number | undefined;
  readonly sourceSurface: GpuRetainedContentSourceSurface;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
}) {
  prepareGpuRetainedContentCanvas(canvas, sourceSurface);
  switchAnimations?.syncSurface(sourceSurface, nowMs);
  drawGpuRetainedContentSurface(ctx, sourceSurface, {
    nowMs,
    palette: getGpuRetainedContentCanvasPalette(
      isGpuRetainedContentCanvasDarkMode(canvas),
    ),
    switchAnimations,
  });
}

function getGpuRetainedContentSourceNowMs(): number {
  if (
    typeof globalThis.performance !== "undefined" &&
    typeof globalThis.performance.now === "function"
  ) {
    return globalThis.performance.now();
  }
  return Date.now();
}

function drawGpuRetainedContentPickerControl({
  control,
  ctx,
  palette,
  rect,
  state,
}: {
  readonly control: GpuRetainedContentControlDescriptor;
  readonly ctx: CanvasRenderingContext2D;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
}): boolean {
  switch (control.kind) {
    case "color-picker":
      drawGpuRetainedContentColorPickerControl({
        control,
        ctx,
        palette,
        rect,
        state,
      });
      return true;
    case "dropdown":
      drawGpuRetainedContentDropdownControl({
        control,
        ctx,
        palette,
        rect,
        state,
      });
      return true;
    case "password":
      drawGpuRetainedContentPasswordControl({
        control,
        ctx,
        rect,
        state,
      });
      return true;
    case "dropzone":
      drawGpuRetainedContentDropzoneControl({
        control,
        ctx,
        rect,
        state,
      });
      return true;
    case "date-time":
      drawGpuRetainedContentDateTimeControl({
        control,
        ctx,
        rect,
        state,
      });
      return true;
    default:
      return false;
  }
}

function drawGpuRetainedContentGenericControl({
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
}: HtmlSurfaceSourceElementConfig<GpuRetainedContentSourceSurface>) {
  host.dataset.gpuFlowRetainedContentSource = "true";
  host.dataset.ownerSectionId = source.ownerSectionId;
  host.setAttribute("data-testid", `gpu-retained-content-source-${source.id}`);
  const style = getGpuRetainedContentSourceStyle(source);
  host.style.height = `${style.height}px`;
  host.style.overflow = "hidden";
  host.style.width = `${style.width}px`;
}

function getGpuRetainedContentSurfaceId(
  surface: GpuRetainedContentSourceSurface,
): string {
  return surface.id;
}

function getGpuRetainedContentSourceSurfaces(
  surfaces: readonly GpuContentSurface[] | undefined,
): readonly GpuRetainedContentSourceSurface[] {
  return (surfaces ?? [])
    .filter(isGpuRetainedContentSurface)
    .map(clipGpuRetainedContentSourceSurface)
    .filter((surface): surface is GpuRetainedContentSourceSurface =>
      Boolean(surface),
    );
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
  surface: GpuRetainedContentSourceSurface,
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
  surface: GpuRetainedContentSourceSurface,
): CSSProperties {
  return {
    display: "block",
    height: surface.rect.height,
    width: surface.rect.width,
  };
}

function clipGpuRetainedContentSourceSurface(
  surface: GpuRetainedContentSurface,
): GpuRetainedContentSourceSurface | null {
  const rect = intersectGpuRetainedContentRects(surface.rect, surface.clipRect);
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  const previousOffset =
    "sourceClipOffset" in surface
      ? (surface.sourceClipOffset as GpuPoint)
      : { x: 0, y: 0 };
  return {
    ...surface,
    rect,
    sourceClipOffset: {
      x: previousOffset.x + rect.x - surface.rect.x,
      y: previousOffset.y + rect.y - surface.rect.y,
    },
  };
}

function intersectGpuRetainedContentRects(
  left: GpuRect,
  right: GpuRect,
): GpuRect {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const width = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) - x,
  );
  const height = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) - y,
  );
  return { height, width, x, y };
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
