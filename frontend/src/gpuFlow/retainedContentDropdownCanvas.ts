import {
  getGpuRetainedContentCanvasPalette,
  type GpuRetainedContentCanvasPalette,
} from "./retainedContentCanvasTheme";
import { GPU_RETAINED_CONTENT_ROW_TEXT_VALUE_INSET_LEFT } from "./retainedContentRowLayout";
import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentDropdownChoice,
  GpuRetainedContentRowState,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

type GpuRetainedContentDropdownControl = Extract<
  GpuRetainedContentControlDescriptor,
  { kind: "dropdown" }
>;

const RETAINED_CONTENT_CONTROL_FONT =
  "10px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

export function drawGpuRetainedContentDropdownControl({
  control,
  ctx,
  palette = getGpuRetainedContentCanvasPalette(false),
  rect,
  state,
}: {
  readonly control: GpuRetainedContentDropdownControl;
  readonly ctx: CanvasRenderingContext2D;
  readonly palette?: GpuRetainedContentCanvasPalette | undefined;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  const outer = getGpuRetainedContentDropdownOuterRect(rect, palette);
  const disabled = state?.disabled ?? false;
  drawGpuRetainedContentDropdownFrame({
    ctx,
    disabled,
    outer,
    palette,
    state,
  });
  drawGpuRetainedContentDropdownLabel({
    control,
    ctx,
    disabled,
    outer,
    palette,
  });
  drawGpuRetainedContentDropdownChevron({
    ctx,
    disabled,
    outer,
    palette,
  });
}

export function drawGpuRetainedContentDropdownPopupOption({
  ctx,
  highlighted,
  option,
  rect,
  selected,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly highlighted: boolean;
  readonly option: GpuRetainedContentDropdownChoice;
  readonly rect: GpuRect;
  readonly selected: boolean;
}) {
  if (selected || highlighted) {
    ctx.fillStyle = selected ? "#dbeafe" : "#eff6ff";
    fillRoundRect(ctx, rect, 4);
  }
  ctx.font = RETAINED_CONTENT_CONTROL_FONT;
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(
    option.label || option.value,
    rect.x + 8,
    rect.y + rect.height / 2,
    Math.max(0, rect.width - 16),
  );
}

function drawGpuRetainedContentDropdownFrame({
  ctx,
  disabled,
  outer,
  palette,
  state,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly outer: GpuRect;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  if (palette.textLikeVisualStyle !== "row-text") {
    drawGpuRetainedContentDropdownLightFrame({
      ctx,
      disabled,
      outer,
      state,
    });
    return;
  }
  drawGpuRetainedContentDropdownRowTextFrame({
    ctx,
    outer,
    palette,
    state,
  });
}

function drawGpuRetainedContentDropdownLightFrame({
  ctx,
  disabled,
  outer,
  state,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly outer: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  ctx.fillStyle = disabled ? "#e2e8f0" : "#ffffff";
  ctx.strokeStyle = state?.selected ? "#2563eb" : "#cbd5e1";
  ctx.lineWidth = 1;
  fillRoundRect(ctx, outer, 5);
  strokeRoundRect(ctx, outer, 5);
}

function drawGpuRetainedContentDropdownRowTextFrame({
  ctx,
  outer,
  palette,
  state,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly outer: GpuRect;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  ctx.fillStyle = "#0b0e13";
  fillRoundRect(ctx, outer, 5);
  if (isGpuRetainedContentControlFocused(state) || state?.selected) {
    ctx.fillStyle = palette.rowFocusedBackground;
    fillRoundRect(ctx, outer, 5);
  }
  ctx.strokeStyle = state?.selected
    ? palette.textLikeSelectedBorder
    : palette.textLikeBorder;
  ctx.lineWidth = 1;
  strokeRoundRect(ctx, outer, 5);
}

function isGpuRetainedContentControlFocused(
  state: GpuRetainedContentRowState | undefined,
): boolean {
  return Boolean(state?.focused || state?.controlFocused);
}

function drawGpuRetainedContentDropdownLabel({
  control,
  ctx,
  disabled,
  outer,
  palette,
}: {
  readonly control: GpuRetainedContentDropdownControl;
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly outer: GpuRect;
  readonly palette: GpuRetainedContentCanvasPalette;
}) {
  const chevronWidth = 8;
  const labelX =
    outer.x + (palette.textLikeVisualStyle === "row-text" ? 13 : 7);
  const selectedChoice = getGpuRetainedContentSelectedDropdownChoice(control);
  ctx.font = RETAINED_CONTENT_CONTROL_FONT;
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillStyle =
    palette.textLikeVisualStyle === "row-text"
      ? disabled
        ? palette.textLikeDisabledText
        : palette.textLikeText
      : disabled
        ? "#64748b"
        : "#334155";
  ctx.fillText(
    selectedChoice?.label || control.displayValue || "Select...",
    labelX,
    outer.y + outer.height / 2,
    Math.max(0, outer.x + outer.width - chevronWidth - 8 - labelX),
  );
}

function drawGpuRetainedContentDropdownChevron({
  ctx,
  disabled,
  outer,
  palette,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly outer: GpuRect;
  readonly palette: GpuRetainedContentCanvasPalette;
}) {
  const chevronCenterX = outer.x + outer.width - 8;
  const chevronCenterY = outer.y + outer.height / 2;
  ctx.beginPath();
  ctx.moveTo(chevronCenterX - 3, chevronCenterY - 1);
  ctx.lineTo(chevronCenterX, chevronCenterY + 2);
  ctx.lineTo(chevronCenterX + 3, chevronCenterY - 1);
  ctx.strokeStyle =
    palette.textLikeVisualStyle === "row-text"
      ? disabled
        ? palette.textLikeDisabledText
        : palette.textLikeText
      : disabled
        ? "#94a3b8"
        : "#475569";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
}

function getGpuRetainedContentSelectedDropdownChoice(
  control: GpuRetainedContentDropdownControl,
): GpuRetainedContentDropdownChoice | null {
  if (control.selectedIndex === null) {
    return null;
  }
  return control.choices[control.selectedIndex] ?? null;
}

export function getGpuRetainedContentDropdownOuterRect(
  rect: GpuRect,
  palette: GpuRetainedContentCanvasPalette,
): GpuRect {
  if (palette.textLikeVisualStyle === "row-text") {
    return {
      height: Math.max(0, rect.height - 8),
      width: Math.max(0, rect.width - 18),
      x: rect.x + GPU_RETAINED_CONTENT_ROW_TEXT_VALUE_INSET_LEFT + 2,
      y: rect.y + 6,
    };
  }
  return insetRect(rect, 6, 5);
}

function insetRect(rect: GpuRect, insetX: number, insetY: number): GpuRect {
  return {
    height: Math.max(0, rect.height - insetY * 2),
    width: Math.max(0, rect.width - insetX * 2),
    x: rect.x + insetX,
    y: rect.y + insetY,
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
  const normalizedRadius = Math.max(
    0,
    Math.min(radius, rect.width / 2, rect.height / 2),
  );
  ctx.beginPath();
  ctx.moveTo(rect.x + normalizedRadius, rect.y);
  ctx.lineTo(rect.x + rect.width - normalizedRadius, rect.y);
  ctx.quadraticCurveTo(
    rect.x + rect.width,
    rect.y,
    rect.x + rect.width,
    rect.y + normalizedRadius,
  );
  ctx.lineTo(rect.x + rect.width, rect.y + rect.height - normalizedRadius);
  ctx.quadraticCurveTo(
    rect.x + rect.width,
    rect.y + rect.height,
    rect.x + rect.width - normalizedRadius,
    rect.y + rect.height,
  );
  ctx.lineTo(rect.x + normalizedRadius, rect.y + rect.height);
  ctx.quadraticCurveTo(
    rect.x,
    rect.y + rect.height,
    rect.x,
    rect.y + rect.height - normalizedRadius,
  );
  ctx.lineTo(rect.x, rect.y + normalizedRadius);
  ctx.quadraticCurveTo(rect.x, rect.y, rect.x + normalizedRadius, rect.y);
  ctx.closePath();
}
