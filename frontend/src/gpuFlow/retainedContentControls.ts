import type { GpuRetainedContentControlDescriptor } from "./retainedContentScene";
import type { GpuPoint, GpuRect } from "./viewportMath";

export type GpuRetainedContentSliderControlDescriptor = Extract<
  GpuRetainedContentControlDescriptor,
  { kind: "slider" }
>;
export type GpuRetainedContentRotaryControlDescriptor = Extract<
  GpuRetainedContentControlDescriptor,
  { kind: "rotary" }
>;
export type GpuRetainedContentRangedControlDescriptor =
  | GpuRetainedContentSliderControlDescriptor
  | GpuRetainedContentRotaryControlDescriptor;

const MAX_NUMERIC_CONTROL_DISPLAY_DECIMALS = 3;
const SLIDER_CONTROL_INSET_X = 6;
const SLIDER_CONTROL_INSET_Y = 5;
const SLIDER_VALUE_LABEL_GAP = 6;
const SLIDER_MIN_VALUE_LABEL_WIDTH = 28;
const SLIDER_MAX_VALUE_LABEL_WIDTH = 38;
const SLIDER_TRACK_HEIGHT = 4;
const SLIDER_THUMB_SIZE = 12;
const ROTARY_CONTROL_INSET_X = 6;
const ROTARY_CONTROL_INSET_Y = 3;
const ROTARY_VALUE_LABEL_GAP = 8;
const ROTARY_VALUE_LABEL_WIDTH = 38;
const ROTARY_MAX_KNOB_SIZE = 22;
const ROTARY_START_DEG = -135;
const ROTARY_END_DEG = 135;
const ROTARY_RANGE_DEG = ROTARY_END_DEG - ROTARY_START_DEG;

export function getGpuRetainedContentSliderTrackRect(rect: GpuRect): GpuRect {
  const outer = insetRect(rect, SLIDER_CONTROL_INSET_X, SLIDER_CONTROL_INSET_Y);
  const valueLabelWidth = getGpuRetainedContentSliderValueLabelWidth(outer);
  return {
    height: Math.min(SLIDER_TRACK_HEIGHT, Math.max(0, outer.height)),
    width: Math.max(0, outer.width - valueLabelWidth - SLIDER_VALUE_LABEL_GAP),
    x: outer.x,
    y: outer.y + (outer.height - SLIDER_TRACK_HEIGHT) / 2,
  };
}

export function getGpuRetainedContentSliderValueLabelRect(
  rect: GpuRect,
): GpuRect {
  const outer = insetRect(rect, SLIDER_CONTROL_INSET_X, SLIDER_CONTROL_INSET_Y);
  const width = getGpuRetainedContentSliderValueLabelWidth(outer);
  return {
    height: outer.height,
    width,
    x: outer.x + outer.width - width,
    y: outer.y,
  };
}

export function getGpuRetainedContentSliderThumbRect({
  control,
  trackRect,
}: {
  readonly control: GpuRetainedContentSliderControlDescriptor;
  readonly trackRect: GpuRect;
}): GpuRect {
  const normalized = getGpuRetainedNumericControlNormalizedValue(control);
  const size = Math.min(
    SLIDER_THUMB_SIZE,
    Math.max(0, Math.max(trackRect.height, SLIDER_THUMB_SIZE)),
  );
  return {
    height: size,
    width: size,
    x: trackRect.x + normalized * trackRect.width - size / 2,
    y: trackRect.y + trackRect.height / 2 - size / 2,
  };
}

export function resolveGpuRetainedSliderValueFromPoint({
  control,
  point,
  rect,
}: {
  readonly control: GpuRetainedContentSliderControlDescriptor;
  readonly point: GpuPoint;
  readonly rect: GpuRect;
}): number {
  const trackRect = getGpuRetainedContentSliderTrackRect(rect);
  if (trackRect.width <= 0) {
    return snapGpuRetainedNumericControlValue({
      max: control.max,
      min: control.min,
      step: control.step,
      value: control.value,
    });
  }
  const normalized = clampNumber(
    (point.x - trackRect.x) / trackRect.width,
    0,
    1,
  );
  return snapGpuRetainedNumericControlValue({
    max: control.max,
    min: control.min,
    step: control.step,
    value: control.min + normalized * (control.max - control.min),
  });
}

export function getGpuRetainedContentRotaryKnobRect(rect: GpuRect): GpuRect {
  const outer = insetRect(rect, ROTARY_CONTROL_INSET_X, ROTARY_CONTROL_INSET_Y);
  const availableWidth = Math.max(
    0,
    outer.width - ROTARY_VALUE_LABEL_WIDTH - ROTARY_VALUE_LABEL_GAP,
  );
  const size = Math.min(
    ROTARY_MAX_KNOB_SIZE,
    Math.max(0, outer.height),
    availableWidth,
  );
  return {
    height: size,
    width: size,
    x: outer.x,
    y: outer.y + (outer.height - size) / 2,
  };
}

export function getGpuRetainedContentRotaryValueLabelRect(
  rect: GpuRect,
): GpuRect {
  const outer = insetRect(rect, ROTARY_CONTROL_INSET_X, ROTARY_CONTROL_INSET_Y);
  const width = Math.min(ROTARY_VALUE_LABEL_WIDTH, Math.max(0, outer.width));
  return {
    height: outer.height,
    width,
    x: outer.x + outer.width - width,
    y: outer.y,
  };
}

export function getGpuRetainedContentRotaryIndicatorAngle(
  control: GpuRetainedContentRotaryControlDescriptor,
): number {
  return getGpuRetainedRotaryAngleFromValue({
    max: control.max,
    min: control.min,
    value: control.value,
  });
}

export function resolveGpuRetainedRotaryValueFromPoint({
  control,
  point,
  rect,
}: {
  readonly control: GpuRetainedContentRotaryControlDescriptor;
  readonly point: GpuPoint;
  readonly rect: GpuRect;
}): number {
  const knobRect = getGpuRetainedContentRotaryKnobRect(rect);
  if (knobRect.width <= 0 || knobRect.height <= 0) {
    return snapGpuRetainedNumericControlValue({
      max: control.max,
      min: control.min,
      step: control.step,
      value: control.value,
    });
  }
  const centerX = knobRect.x + knobRect.width / 2;
  const centerY = knobRect.y + knobRect.height / 2;
  const angle =
    (Math.atan2(point.y - centerY, point.x - centerX) * 180) / Math.PI;
  return getGpuRetainedRotaryValueFromAngle({
    angle,
    control,
  });
}

export function snapGpuRetainedNumericControlValue({
  max,
  min,
  step,
  value,
}: {
  readonly max: number;
  readonly min: number;
  readonly step: number;
  readonly value: number;
}): number {
  const clampedValue = clampNumber(value, min, max);
  if (!isGpuRetainedAdjustableStep(step)) {
    return clampedValue;
  }
  const steps = Math.round((clampedValue - min) / step);
  const snappedValue = min + steps * step;
  return clampNumber(
    roundTo(snappedValue, getGpuRetainedNumericStepPrecision(step)),
    min,
    max,
  );
}

export function formatGpuRetainedNumericControlValue({
  step,
  value,
}: {
  readonly step: number;
  readonly value: number;
}): string {
  return roundTo(value, getGpuRetainedNumericStepPrecision(step)).toString();
}

function getGpuRetainedContentSliderValueLabelWidth(outer: GpuRect): number {
  return Math.min(
    SLIDER_MAX_VALUE_LABEL_WIDTH,
    Math.max(SLIDER_MIN_VALUE_LABEL_WIDTH, outer.width * 0.34),
  );
}

function getGpuRetainedNumericControlNormalizedValue({
  max,
  min,
  value,
}: Pick<
  GpuRetainedContentRangedControlDescriptor,
  "max" | "min" | "value"
>): number {
  const range = max - min;
  if (range <= 0) {
    return 0;
  }
  return clampNumber((value - min) / range, 0, 1);
}

function isGpuRetainedAdjustableStep(step: number): boolean {
  return Number.isFinite(step) && step > 0;
}

function getGpuRetainedNumericStepPrecision(step: number): number {
  if (!isGpuRetainedAdjustableStep(step)) {
    return 2;
  }
  const stepText = step.toString();
  const dotIndex = stepText.indexOf(".");
  if (dotIndex === -1) {
    return 0;
  }
  const decimals = stepText.length - dotIndex - 1;
  return clampNumber(decimals, 0, MAX_NUMERIC_CONTROL_DISPLAY_DECIMALS);
}

function roundTo(value: number, precision: number): number {
  if (precision <= 0) {
    return Math.round(value);
  }
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function getGpuRetainedRotaryAngleFromValue({
  max,
  min,
  value,
}: Pick<
  GpuRetainedContentRotaryControlDescriptor,
  "max" | "min" | "value"
>): number {
  return (
    ROTARY_START_DEG +
    getGpuRetainedNumericControlNormalizedValue({ max, min, value }) *
      ROTARY_RANGE_DEG
  );
}

function getGpuRetainedRotaryValueFromAngle({
  angle,
  control,
}: {
  readonly angle: number;
  readonly control: GpuRetainedContentRotaryControlDescriptor;
}): number {
  const clampedAngle = clampNumber(angle, ROTARY_START_DEG, ROTARY_END_DEG);
  const normalized = (clampedAngle - ROTARY_START_DEG) / ROTARY_RANGE_DEG;
  return snapGpuRetainedNumericControlValue({
    max: control.max,
    min: control.min,
    step: control.step,
    value: control.min + normalized * (control.max - control.min),
  });
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function insetRect(rect: GpuRect, x: number, y: number): GpuRect {
  return {
    height: Math.max(0, rect.height - y * 2),
    width: Math.max(0, rect.width - x * 2),
    x: rect.x + x,
    y: rect.y + y,
  };
}
