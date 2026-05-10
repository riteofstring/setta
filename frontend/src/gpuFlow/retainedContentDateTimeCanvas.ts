import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentRowState,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

type GpuRetainedContentDateTimeControl = Extract<
  GpuRetainedContentControlDescriptor,
  { kind: "date-time" }
>;

const DATE_TIME_LABEL_FONT =
  "10px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
const DATE_TIME_VALUE_FONT =
  "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

export function drawGpuRetainedContentDateTimeControl({
  control,
  ctx,
  rect,
  state,
}: {
  readonly control: GpuRetainedContentDateTimeControl;
  readonly ctx: CanvasRenderingContext2D;
  readonly rect: GpuRect;
  readonly state: GpuRetainedContentRowState | undefined;
}) {
  const disabled = state?.disabled ?? false;
  const outer = insetRect(rect, 6, 5);
  const iconRect = getGpuRetainedContentDateTimeIconRect(outer);
  const textRect = {
    height: outer.height,
    width: Math.max(0, outer.width - iconRect.width - 8),
    x: iconRect.x + iconRect.width + 6,
    y: outer.y,
  };

  ctx.fillStyle = disabled ? "#f1f5f9" : "#ffffff";
  ctx.strokeStyle = state?.selected ? "#2563eb" : "#cbd5e1";
  ctx.lineWidth = 1;
  fillRoundRect(ctx, outer, 5);
  strokeRoundRect(ctx, outer, 5);

  drawGpuRetainedContentDateTimeIcon({
    control,
    ctx,
    disabled,
    rect: iconRect,
  });
  drawGpuRetainedContentDateTimeText({
    control,
    ctx,
    disabled,
    rect: textRect,
  });
}

export function getGpuRetainedContentDateTimePrimaryText(
  control: GpuRetainedContentDateTimeControl,
): string {
  if (control.summaryText && control.summaryText.trim().length > 0) {
    return control.summaryText;
  }
  if (control.displayValue.trim().length > 0) {
    return control.displayValue;
  }
  if (control.mode === "time-display" || control.mode === "time-input") {
    return "--:--";
  }
  return "No date";
}

function drawGpuRetainedContentDateTimeIcon({
  control,
  ctx,
  disabled,
  rect,
}: {
  readonly control: GpuRetainedContentDateTimeControl;
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly rect: GpuRect;
}) {
  ctx.fillStyle = disabled ? "#e2e8f0" : "#eff6ff";
  fillRoundRect(ctx, rect, 4);

  ctx.strokeStyle = disabled ? "#94a3b8" : "#2563eb";
  ctx.lineWidth = 1.25;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (control.mode === "time-display" || control.mode === "time-input") {
    drawGpuRetainedContentClockIcon(ctx, rect);
  } else {
    drawGpuRetainedContentCalendarIcon(ctx, rect);
  }
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
}

function drawGpuRetainedContentCalendarIcon(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
) {
  const icon = insetRect(rect, 4, 4);
  ctx.strokeRect(icon.x, icon.y + 2, icon.width, icon.height - 2);
  ctx.beginPath();
  ctx.moveTo(icon.x, icon.y + 6);
  ctx.lineTo(icon.x + icon.width, icon.y + 6);
  ctx.moveTo(icon.x + 4, icon.y);
  ctx.lineTo(icon.x + 4, icon.y + 4);
  ctx.moveTo(icon.x + icon.width - 4, icon.y);
  ctx.lineTo(icon.x + icon.width - 4, icon.y + 4);
  ctx.stroke();
}

function drawGpuRetainedContentClockIcon(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
) {
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const radius = Math.max(0, Math.min(rect.width, rect.height) / 2 - 4);
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX, centerY - radius + 3);
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(centerX + radius - 4, centerY);
  ctx.stroke();
}

function drawGpuRetainedContentDateTimeText({
  control,
  ctx,
  disabled,
  rect,
}: {
  readonly control: GpuRetainedContentDateTimeControl;
  readonly ctx: CanvasRenderingContext2D;
  readonly disabled: boolean;
  readonly rect: GpuRect;
}) {
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = DATE_TIME_VALUE_FONT;
  ctx.fillStyle = disabled ? "#94a3b8" : "#334155";
  ctx.fillText(
    getGpuRetainedContentDateTimePrimaryText(control),
    rect.x,
    rect.y + rect.height * 0.38,
    Math.max(0, rect.width),
  );
  ctx.font = DATE_TIME_LABEL_FONT;
  ctx.fillStyle = disabled ? "#cbd5e1" : "#64748b";
  ctx.fillText(
    control.label,
    rect.x,
    rect.y + rect.height * 0.74,
    Math.max(0, rect.width),
  );
  ctx.textAlign = "start";
}

function getGpuRetainedContentDateTimeIconRect(outer: GpuRect): GpuRect {
  const size = Math.min(18, Math.max(0, outer.height - 4));
  return {
    height: size,
    width: size,
    x: outer.x + 4,
    y: outer.y + (outer.height - size) / 2,
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
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  ctx.fill();
}

function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  rect: GpuRect,
  radius: number,
) {
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, radius);
  ctx.stroke();
}
