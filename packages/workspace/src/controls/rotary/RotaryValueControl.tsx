import {
  useRef,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { useItemSelectionModeForControl } from "../../document/itemSelectionMode";
import {
  MANUAL_WHEEL_CLASS_NAME,
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "../../interaction";
import {
  assertNumericControlConfig,
  clampNumericValue,
  type NumericControlConfig,
} from "../numeric/numericControlConfig";
import { handleSectionControlEscape } from "../sectionFocus";
import { useWorkspaceHost } from "../../workspaceHostContext";

const ROTARY_START_DEG = -135;
const ROTARY_END_DEG = 135;
const ROTARY_RANGE_DEG = ROTARY_END_DEG - ROTARY_START_DEG;
const MAX_DISPLAY_DECIMALS = 3;
const DRAG_PIXELS_PER_RANGE = 160;
const KEYBOARD_STEP_DIRECTIONS = {
  ArrowDown: -1,
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: 1,
} as const;

export type RotaryValueControlProps = {
  ariaLabel: string;
  sectionId: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
};

export function RotaryValueControl({
  ariaLabel,
  sectionId,
  value,
  onValueChange,
  min,
  max,
  step,
  disabled = false,
}: RotaryValueControlProps) {
  const host = useWorkspaceHost();
  assertNumericControlConfig("RotaryValueControl", { min, max, step });
  const dragRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    value: number;
  } | null>(null);
  const isSelectingItems = useItemSelectionModeForControl();
  const isDisabled = disabled || isSelectingItems;
  const clampedValue = parseValue(value, min, max);
  const indicatorAngle = getAngleFromValue(clampedValue, min, max);
  const displayValue = formatValue(clampedValue, step);
  const knobStateClasses = isDisabled
    ? "cursor-not-allowed opacity-50"
    : "cursor-grab active:cursor-grabbing";
  const wheelBoundaryClassName = isDisabled ? "" : MANUAL_WHEEL_CLASS_NAME;
  const reportChange = (nextValue: number) => onValueChange(String(nextValue));

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (isDisabled) {
      return;
    }
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      value: clampedValue,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) {
      return;
    }
    const travel = event.clientX - drag.x - (event.clientY - drag.y);
    reportChange(
      snapToStep(drag.value + (travel / DRAG_PIXELS_PER_RANGE) * (max - min), {
        min,
        max,
        step,
      }),
    );
  }

  function finishPointer(event: PointerEvent<HTMLButtonElement>) {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleWheel(event: WheelEvent<HTMLButtonElement>) {
    if (isDisabled) {
      return;
    }
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    reportChange(
      snapToStep(clampedValue + direction * step, { min, max, step }),
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (handleSectionControlEscape(host, event, sectionId)) {
      return;
    }
    if (isDisabled) {
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
    reportChange(snapToStep(nextValue, { min, max, step }));
  }

  return (
    <div
      className={`${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} section-value flex items-center gap-2`}
    >
      <button
        type="button"
        className={`${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} ${wheelBoundaryClassName} ${knobStateClasses} relative h-10 w-10 touch-none select-none rounded-full bg-transparent p-0`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        disabled={isDisabled}
        role="slider"
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clampedValue}
        aria-valuetext={displayValue}
        data-setta-workspace-touch-target="gesture"
      >
        <div className="absolute inset-0 rounded-full border border-setta-300/70 bg-gradient-to-br from-setta-50 via-setta-200 to-setta-300 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)] dark:border-setta-700/70 dark:from-setta-900 dark:via-setta-800 dark:to-setta-950" />
        <div className="absolute inset-[5px] rounded-full border border-setta-200/70 bg-setta-100 dark:border-setta-700/70 dark:bg-setta-850" />
        <div className="absolute inset-[10px] rounded-full bg-setta-50 dark:bg-setta-900" />
        <div
          className="absolute inset-0"
          style={{ transform: `rotate(${indicatorAngle}deg)` }}
        >
          <div className="absolute left-1/2 top-[5px] h-3 w-[2px] -translate-x-1/2 rounded-full bg-blue-500" />
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

function parseValue(value: string, min: number, max: number): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return clampNumericValue(parsed, min, max);
}

function getAngleFromValue(value: number, min: number, max: number): number {
  const normalized = (value - min) / (max - min);
  return ROTARY_START_DEG + normalized * ROTARY_RANGE_DEG;
}

function snapToStep(
  value: number,
  { min, max, step }: NumericControlConfig,
): number {
  const clampedValue = clampNumericValue(value, min, max);
  const steps = Math.round((clampedValue - min) / step);
  const snappedValue = min + steps * step;
  return clampNumericValue(
    roundTo(snappedValue, getStepPrecision(step)),
    min,
    max,
  );
}

function getStepPrecision(step: number): number {
  const stepText = step.toString();
  const dotIndex = stepText.indexOf(".");
  if (dotIndex === -1) {
    return 0;
  }
  return Math.min(stepText.length - dotIndex - 1, MAX_DISPLAY_DECIMALS);
}

function roundTo(value: number, precision: number): number {
  if (precision <= 0) {
    return Math.round(value);
  }
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function formatValue(value: number, step: number): string {
  return String(roundTo(value, getStepPrecision(step)));
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
  return direction === undefined ? null : clampedValue + direction * step;
}
