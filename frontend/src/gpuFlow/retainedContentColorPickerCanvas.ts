import type {
  GpuRetainedContentColorChoice,
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentRowState,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

type GpuRetainedContentColorPickerControl = Extract<
  GpuRetainedContentControlDescriptor,
  { kind: "color-picker" }
>;

const RETAINED_CONTENT_CONTROL_FONT =
  "10px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

export function drawGpuRetainedContentColorPickerControl({
  control,
  ctx,
  rect,
  state,
}: {
  readonly control: GpuRetainedContentColorPickerControl;
  readonly ctx: CanvasRenderingContext2D;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  const outer = insetRect(rect, 6, 5);
  const disabled = state?.disabled ?? false;
  const selectedChoice = getGpuRetainedContentSelectedColorChoice(control);
  drawGpuRetainedContentColorPickerFrame({ ctx, disabled, outer, state });
  const swatchRect = getGpuRetainedContentColorSwatchRect(outer);
  drawGpuRetainedContentColorSwatch({
    color: selectedChoice?.color ?? control.displayValue,
    ctx,
    disabled,
    rect: swatchRect,
  });
  drawGpuRetainedContentColorPickerLabel({
    control,
    ctx,
    outer,
    selectedChoice,
    swatchRect,
    disabled,
  });
  drawGpuRetainedContentColorPickerChevron({ ctx, disabled, outer });
}

export function drawGpuRetainedContentControlPopupBackground(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
) {
  ctx.save();
  ctx.shadowColor = "rgba(15, 23, 42, 0.16)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#ffffff";
  fillRoundRect(ctx, rect, 6);
  ctx.restore();
  ctx.strokeStyle = "#bfdbfe";
  ctx.lineWidth = 1;
  strokeRoundRect(ctx, rect, 6);
}

export function drawGpuRetainedContentColorPickerPopupOption({
  ctx,
  option,
  rect,
  selected,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly option: GpuRetainedContentColorChoice;
  readonly rect: GpuRect;
  readonly selected: boolean;
}) {
  if (selected) {
    ctx.fillStyle = "#dbeafe";
    fillRoundRect(ctx, rect, 4);
  }
  const swatchRect = getGpuRetainedContentColorPopupSwatchRect(rect);
  drawGpuRetainedContentColorSwatch({
    color: option.color,
    ctx,
    disabled: false,
    rect: swatchRect,
  });
  ctx.font = RETAINED_CONTENT_CONTROL_FONT;
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#0f172a";
  ctx.fillText(
    option.description || option.color,
    swatchRect.x + swatchRect.width + 7,
    rect.y + rect.height / 2,
    Math.max(0, rect.width - swatchRect.width - 18),
  );
}

function drawGpuRetainedContentColorPickerFrame({
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

function drawGpuRetainedContentColorSwatch({
  color,
  ctx,
  disabled,
  rect,
}: {
  readonly color: string;
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly rect: GpuRect;
}) {
  ctx.fillStyle = color;
  fillRoundRect(ctx, rect, 3);
  ctx.strokeStyle = disabled ? "#cbd5e1" : "#94a3b8";
  ctx.lineWidth = 1;
  strokeRoundRect(ctx, rect, 3);
}

function drawGpuRetainedContentColorPickerLabel({
  control,
  ctx,
  disabled,
  outer,
  selectedChoice,
  swatchRect,
}: {
  readonly control: GpuRetainedContentColorPickerControl;
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly outer: GpuRect;
  readonly selectedChoice: GpuRetainedContentColorChoice | null;
  readonly swatchRect: GpuRect;
}) {
  const chevronWidth = 8;
  const labelX = swatchRect.x + swatchRect.width + 6;
  const labelMaxWidth = Math.max(
    0,
    outer.x + outer.width - chevronWidth - 8 - labelX,
  );
  ctx.font = RETAINED_CONTENT_CONTROL_FONT;
  ctx.textAlign = "start";
  ctx.textBaseline = "middle";
  ctx.fillStyle = disabled ? "#64748b" : "#334155";
  ctx.fillText(
    getGpuRetainedContentColorPickerLabel({ control, selectedChoice }),
    labelX,
    outer.y + outer.height / 2,
    labelMaxWidth,
  );
}

function drawGpuRetainedContentColorPickerChevron({
  ctx,
  disabled,
  outer,
}: {
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly outer: GpuRect;
}) {
  const chevronCenterX = outer.x + outer.width - 8;
  const chevronCenterY = outer.y + outer.height / 2;
  ctx.beginPath();
  ctx.moveTo(chevronCenterX - 3, chevronCenterY - 1);
  ctx.lineTo(chevronCenterX, chevronCenterY + 2);
  ctx.lineTo(chevronCenterX + 3, chevronCenterY - 1);
  ctx.strokeStyle = disabled ? "#94a3b8" : "#475569";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
}

function getGpuRetainedContentColorPickerLabel({
  control,
  selectedChoice,
}: {
  readonly control: GpuRetainedContentColorPickerControl;
  readonly selectedChoice: GpuRetainedContentColorChoice | null;
}): string {
  return (
    selectedChoice?.description || selectedChoice?.color || control.displayValue
  );
}

function getGpuRetainedContentSelectedColorChoice(
  control: GpuRetainedContentColorPickerControl,
): GpuRetainedContentColorChoice | null {
  if (control.selectedIndex === null) {
    return control.choices[0] ?? null;
  }
  return control.choices[control.selectedIndex] ?? control.choices[0] ?? null;
}

function getGpuRetainedContentColorSwatchRect(outer: GpuRect): GpuRect {
  const swatchSize = Math.max(0, Math.min(14, outer.height - 6));
  return {
    height: swatchSize,
    width: swatchSize,
    x: outer.x + 5,
    y: outer.y + (outer.height - swatchSize) / 2,
  };
}

function getGpuRetainedContentColorPopupSwatchRect(rect: GpuRect): GpuRect {
  const swatchSize = Math.max(0, Math.min(14, rect.height - 8));
  return {
    height: swatchSize,
    width: swatchSize,
    x: rect.x + 6,
    y: rect.y + (rect.height - swatchSize) / 2,
  };
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
