import type { KeyboardEvent, PointerEvent, WheelEvent } from "react";
import { useRef } from "react";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "utils/constants";
import { clamp } from "utils/utils";

const ROTARY_START_DEG = -135;
const ROTARY_END_DEG = 135;
const ROTARY_RANGE_DEG = ROTARY_END_DEG - ROTARY_START_DEG;
const MAX_DISPLAY_DECIMALS = 3;
const KEYBOARD_STEP_DIRECTIONS = {
  ArrowDown: -1,
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: 1,
} as const;

type RotaryInputProps = {
  value: string | number;
  onChange?: (value: number) => void;
  onEscape?: () => void;
  min: number;
  max: number;
  step: number;
  isDisabled?: boolean;
  indicatorThemeClassName?: string;
};

export function RotaryInput({
  value,
  onChange,
  onEscape,
  min,
  max,
  step,
  isDisabled = false,
  indicatorThemeClassName,
}: RotaryInputProps) {
  const pointerIdRef = useRef<number | null>(null);
  const clampedValue = parseValue(value, min, max);
  const indicatorAngle = getAngleFromValue(clampedValue, min, max);
  const displayValue = formatValue(clampedValue, step);
  const indicatorResolvedThemeClassName =
    indicatorThemeClassName ?? "bg-blue-500";

  let knobStateClasses = "cursor-grab active:cursor-grabbing";
  if (isDisabled) {
    knobStateClasses = "cursor-not-allowed opacity-50";
  }

  function updateFromPointer(event: PointerEvent<HTMLButtonElement>) {
    if (!onChange) {
      return;
    }
    const angle = getPointerAngle(event, event.currentTarget);
    const nextValue = getValueFromAngle(angle, min, max, step);
    onChange(nextValue);
  }

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (isDisabled) {
      return;
    }
    event.preventDefault();
    const target = event.currentTarget;
    pointerIdRef.current = event.pointerId;
    target.setPointerCapture(event.pointerId);
    updateFromPointer(event);
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }
    updateFromPointer(event);
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }
    pointerIdRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handlePointerCancel(event: PointerEvent<HTMLButtonElement>) {
    if (pointerIdRef.current !== event.pointerId) {
      return;
    }
    pointerIdRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event: WheelEvent<HTMLButtonElement>) {
    if (isDisabled) {
      return;
    }
    if (!isAdjustableStep(step)) {
      return;
    }
    event.preventDefault();
    let direction = -1;
    if (event.deltaY < 0) {
      direction = 1;
    }
    const nextValue = snapToStep(
      clampedValue + direction * step,
      min,
      max,
      step,
    );
    if (onChange) {
      onChange(nextValue);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Escape") {
      if (onEscape) {
        onEscape();
      }
      return;
    }
    if (isDisabled || !isAdjustableStep(step)) {
      return;
    }
    const nextValue = resolveKeyboardValue(
      event.key,
      clampedValue,
      min,
      max,
      step,
    );
    if (nextValue === null) {
      return;
    }
    event.preventDefault();
    if (onChange) {
      onChange(snapToStep(nextValue, min, max, step));
    }
  }

  return (
    <div
      className={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} section-value flex items-center gap-2`}
    >
      <button
        type="button"
        className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${knobStateClasses} relative h-10 w-10 touch-none select-none rounded-full bg-transparent p-0`}
        data-gpu-flow-interactive="true"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        disabled={isDisabled}
        role="slider"
        aria-label="Rotary control"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clampedValue}
        aria-valuetext={displayValue}
      >
        <div className="absolute inset-0 rounded-full border border-setta-300/70 bg-gradient-to-br from-setta-50 via-setta-200 to-setta-300 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)] dark:border-setta-700/70 dark:from-setta-900 dark:via-setta-800 dark:to-setta-950" />
        <div className="absolute inset-[5px] rounded-full border border-setta-200/70 bg-setta-100 dark:border-setta-700/70 dark:bg-setta-850" />
        <div className="absolute inset-[10px] rounded-full bg-setta-50 dark:bg-setta-900" />
        <div
          className="absolute inset-0"
          style={{ transform: `rotate(${indicatorAngle}deg)` }}
        >
          <div
            className={`absolute left-1/2 top-[5px] h-3 w-[2px] -translate-x-1/2 rounded-full ${indicatorResolvedThemeClassName}`}
          />
        </div>
        <div className="absolute inset-0 rounded-full border border-dashed border-setta-300/40 dark:border-setta-700/40" />
      </button>
      <div className="flex min-w-[48px] flex-col items-start">
        <span className="font-mono text-xs text-setta-700 dark:text-setta-200">
          {displayValue}
        </span>
      </div>
    </div>
  );
}

function parseValue(value: string | number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return clamp(parsed, min, max);
}

function getAngleFromValue(value: number, min: number, max: number): number {
  const range = max - min;
  if (range <= 0) {
    return ROTARY_START_DEG;
  }
  const normalized = (value - min) / range;
  return ROTARY_START_DEG + normalized * ROTARY_RANGE_DEG;
}

function getValueFromAngle(
  angle: number,
  min: number,
  max: number,
  step: number,
): number {
  const range = max - min;
  if (range <= 0) {
    return min;
  }
  const clampedAngle = clamp(angle, ROTARY_START_DEG, ROTARY_END_DEG);
  const normalized = (clampedAngle - ROTARY_START_DEG) / ROTARY_RANGE_DEG;
  const rawValue = min + normalized * range;
  return snapToStep(rawValue, min, max, step);
}

function snapToStep(
  value: number,
  min: number,
  max: number,
  step: number,
): number {
  const clampedValue = clamp(value, min, max);
  if (!isAdjustableStep(step)) {
    return clampedValue;
  }
  const steps = Math.round((clampedValue - min) / step);
  const snappedValue = min + steps * step;
  const precision = getStepPrecision(step);
  const roundedValue = roundTo(snappedValue, precision);
  return clamp(roundedValue, min, max);
}

function getStepPrecision(step: number): number {
  if (!isAdjustableStep(step)) {
    return 2;
  }
  const stepText = step.toString();
  const dotIndex = stepText.indexOf(".");
  if (dotIndex === -1) {
    return 0;
  }
  const decimals = stepText.length - dotIndex - 1;
  if (decimals <= 0) {
    return 0;
  }
  if (decimals > MAX_DISPLAY_DECIMALS) {
    return MAX_DISPLAY_DECIMALS;
  }
  return decimals;
}

function roundTo(value: number, precision: number): number {
  if (precision <= 0) {
    return Math.round(value);
  }
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function formatValue(value: number, step: number): string {
  const precision = getStepPrecision(step);
  const rounded = roundTo(value, precision);
  return String(rounded);
}

function isAdjustableStep(step: number): boolean {
  return Number.isFinite(step) && step > 0;
}

function resolveKeyboardValue(
  key: string,
  clampedValue: number,
  min: number,
  max: number,
  step: number,
): number | null {
  if (key === "Home") {
    return min;
  }
  if (key === "End") {
    return max;
  }
  const direction =
    KEYBOARD_STEP_DIRECTIONS[key as keyof typeof KEYBOARD_STEP_DIRECTIONS];
  if (direction === undefined) {
    return null;
  }
  return clampedValue + direction * step;
}

function getPointerAngle(
  event: PointerEvent<HTMLButtonElement>,
  target: HTMLButtonElement,
): number {
  const rect = target.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const deltaX = event.clientX - centerX;
  const deltaY = event.clientY - centerY;
  return (Math.atan2(deltaY, deltaX) * 180) / Math.PI;
}
