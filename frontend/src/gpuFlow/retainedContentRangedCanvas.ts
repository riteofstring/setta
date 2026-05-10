import { fillRoundRect, strokeRoundRect } from "./retainedContentCanvasDrawing";
import {
  getGpuRetainedContentRotaryIndicatorAngle,
  getGpuRetainedContentRotaryKnobRect,
  getGpuRetainedContentRotaryValueLabelRect,
  getGpuRetainedContentSliderThumbRect,
  getGpuRetainedContentSliderTrackRect,
  getGpuRetainedContentSliderValueLabelRect,
} from "./retainedContentControls";
import type {
  GpuRetainedContentControlDescriptor,
  GpuRetainedContentRowState,
} from "./retainedContentScene";
import type { GpuRect } from "./viewportMath";

const RETAINED_CONTENT_CONTROL_FONT =
  "10px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

export function drawGpuRetainedContentRotaryControl({
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

export function drawGpuRetainedContentSliderControl({
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
