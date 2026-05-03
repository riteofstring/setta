import { useLayoutEffect, useMemo, useRef, type CSSProperties } from "react";

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
  getGpuRetainedContentRotaryIndicatorAngle,
  getGpuRetainedContentRotaryKnobRect,
  getGpuRetainedContentRotaryValueLabelRect,
  getGpuRetainedContentSliderThumbRect,
  getGpuRetainedContentSliderTrackRect,
  getGpuRetainedContentSliderValueLabelRect,
} from "./retainedContentControls";
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
import {
  drawGpuRetainedContentStatusBadge,
  drawGpuRetainedContentStatusOverlay,
} from "./retainedContentStatusCanvas";
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
    drawGpuRetainedContentSurface(ctx, surface, {
      palette: getGpuRetainedContentCanvasPalette(
        isGpuRetainedContentCanvasDarkMode(canvas),
      ),
    });
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

function drawGpuRetainedContentSurface(
  ctx: CanvasRenderingContext2D,
  surface: GpuRetainedContentSourceSurface,
  { palette }: { readonly palette: GpuRetainedContentCanvasPalette },
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
      palette,
      rowState: rowStateById.get(command.rowId),
    });
  }
  drawGpuRetainedContentPortAnchors(ctx, scene);
  ctx.restore();
}

function drawGpuRetainedContentCommand({
  command,
  ctx,
  palette,
  rowState,
}: {
  readonly command: GpuRetainedContentDrawCommand;
  readonly ctx: CanvasRenderingContext2D;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly rowState: GpuRetainedContentRowState | undefined;
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
      palette,
      rect: command.rect,
      state: rowState,
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
  palette,
  rect,
  state,
}: {
  readonly control: GpuRetainedContentControlDescriptor;
  readonly controlKind: string;
  readonly ctx: CanvasRenderingContext2D;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  if (
    drawGpuRetainedContentInputControl({
      control,
      ctx,
      palette,
      rect,
      state,
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

function drawGpuRetainedContentRotaryControl({
  control,
  ctx,
  rect,
  state,
}: {
  readonly control: Extract<
    GpuRetainedContentControlDescriptor,
    { kind: "rotary" }
  >;
  readonly ctx: CanvasRenderingContext2D;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  const disabled = state?.disabled ?? false;
  const knobRect = getGpuRetainedContentRotaryKnobRect(rect);
  const valueRect = getGpuRetainedContentRotaryValueLabelRect(rect);
  const centerX = knobRect.x + knobRect.width / 2;
  const centerY = knobRect.y + knobRect.height / 2;
  const radius = Math.max(0, Math.min(knobRect.width, knobRect.height) / 2);

  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fillStyle = disabled ? "#e2e8f0" : "#f8fafc";
  ctx.fill();
  ctx.strokeStyle = disabled ? "#cbd5e1" : "#94a3b8";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(centerX, centerY, Math.max(0, radius - 5), 0, Math.PI * 2);
  ctx.fillStyle = disabled ? "#f1f5f9" : "#ffffff";
  ctx.fill();

  const indicatorAngle =
    (getGpuRetainedContentRotaryIndicatorAngle(control) * Math.PI) / 180;
  const indicatorInnerRadius = radius * 0.25;
  const indicatorOuterRadius = radius * 0.72;
  ctx.beginPath();
  ctx.moveTo(
    centerX + Math.cos(indicatorAngle) * indicatorInnerRadius,
    centerY + Math.sin(indicatorAngle) * indicatorInnerRadius,
  );
  ctx.lineTo(
    centerX + Math.cos(indicatorAngle) * indicatorOuterRadius,
    centerY + Math.sin(indicatorAngle) * indicatorOuterRadius,
  );
  ctx.strokeStyle = disabled ? "#94a3b8" : "#2563eb";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.lineCap = "butt";

  ctx.font = RETAINED_CONTENT_CONTROL_FONT;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = disabled ? "#64748b" : "#334155";
  ctx.fillText(
    control.displayValue,
    valueRect.x + valueRect.width,
    valueRect.y + valueRect.height / 2,
    valueRect.width,
  );
  ctx.textAlign = "start";
}

function drawGpuRetainedContentSliderControl({
  control,
  ctx,
  rect,
  state,
}: {
  readonly control: Extract<
    GpuRetainedContentControlDescriptor,
    { kind: "slider" }
  >;
  readonly ctx: CanvasRenderingContext2D;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  const disabled = state?.disabled ?? false;
  const trackRect = getGpuRetainedContentSliderTrackRect(rect);
  const valueRect = getGpuRetainedContentSliderValueLabelRect(rect);

  ctx.fillStyle = disabled ? "#e2e8f0" : "#cbd5e1";
  fillRoundRect(ctx, trackRect, trackRect.height / 2);

  const thumbRect = getGpuRetainedContentSliderThumbRect({
    control,
    trackRect,
  });
  const rangeRect = {
    height: trackRect.height,
    width: Math.max(0, thumbRect.x + thumbRect.width / 2 - trackRect.x),
    x: trackRect.x,
    y: trackRect.y,
  };
  ctx.fillStyle = disabled ? "#94a3b8" : "#2563eb";
  fillRoundRect(ctx, rangeRect, rangeRect.height / 2);

  ctx.fillStyle = disabled ? "#f1f5f9" : "#ffffff";
  fillRoundRect(ctx, thumbRect, thumbRect.height / 2);
  ctx.strokeStyle = disabled ? "#cbd5e1" : "#1d4ed8";
  ctx.lineWidth = 1;
  strokeRoundRect(ctx, thumbRect, thumbRect.height / 2);

  ctx.font = RETAINED_CONTENT_CONTROL_FONT;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = disabled ? "#64748b" : "#334155";
  ctx.fillText(
    control.displayValue,
    valueRect.x + valueRect.width,
    valueRect.y + valueRect.height / 2,
    valueRect.width,
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
