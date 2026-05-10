import { drawGpuRetainedContentButtonControl } from "./retainedContentButtonCanvas";
import { fillRoundRect, strokeRoundRect } from "./retainedContentCanvasDrawing";
import type { GpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
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
import {
  drawGpuRetainedContentStatusBadge,
  drawGpuRetainedContentStatusOverlay,
} from "./retainedContentStatusCanvas";
import type { GpuRetainedContentSwitchAnimationStore } from "./retainedContentSwitchAnimation";
import { drawGpuRetainedContentSwitchControl } from "./retainedContentSwitchCanvas";
import { drawGpuRetainedContentTextLikeControl } from "./retainedContentTextLikeCanvas";
import type { GpuRect } from "./viewportMath";

const RETAINED_CONTENT_FONT =
  "12px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const RETAINED_CONTENT_CONTROL_FONT =
  "10px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

export function drawGpuRetainedContentCommand({
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
  if (drawGpuRetainedContentRowCommand({ command, ctx, palette })) {
    return;
  }
  if (drawGpuRetainedContentPopupCommand({ command, ctx })) {
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
    drawGpuRetainedContentPickerControl({ control, ctx, palette, rect, state })
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

export function drawGpuRetainedContentPortAnchors(
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

function insetRect(rect: GpuRect, x: number, y: number): GpuRect {
  return {
    height: Math.max(0, rect.height - y * 2),
    width: Math.max(0, rect.width - x * 2),
    x: rect.x + x,
    y: rect.y + y,
  };
}
