import * as Slider from "@radix-ui/react-slider";
import { useEffect, useState } from "react";
import { useItemSelectionMode } from "../../document/itemSelectionMode";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "../../interaction";
import { assertNumericControlConfig, clampNumericValue } from "../numeric/numericControlConfig";
import { focusSectionAfterEscape } from "../sectionFocus";

// The remaining-controls milestone's slider: the reference `SliderInput` at the ordinary
// `ParamUI` row presentation. Radix owns pointer and keyboard stepping; the adjacent numeric
// field keeps the reference's temporary edit, finite parse, clamp, and blur-commit behavior.
// Live gesture changes and end-of-gesture commits remain separate callbacks so a host can keep
// the reference cadence without importing its debounced transport.

export type SliderValueControlProps = {
  ariaLabel: string;
  sectionId: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  onValueCommit?: (nextValue: string) => void;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
};

// The `ParamUI` placement and `SliderInput` class strings, with package interaction boundaries
// on the wrapper so neither the track, thumb, nor numeric field starts section drag or canvas pan.
const WRAPPER_CLASS_NAME = `${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} cursor-pointer @container/slider section-value flex gap-1`;
const ROOT_CLASS_NAME =
  "data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex w-full touch-none select-none items-center data-[orientation='horizontal']:h-5";
const TRACK_CLASS_NAME =
  "relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700";
const RANGE_CLASS_NAME = "absolute h-full rounded-full bg-blue-500";
const THUMB_CLASS_NAME = `${NO_DRAG_CLASS_NAME} block h-3 w-3 cursor-pointer rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:!bg-setta-100 hover:dark:!bg-setta-700 focus-visible:!border-blue-500 focus-visible:bg-blue-500 focus-visible:dark:bg-blue-700 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600 data-[disabled]:pointer-events-none`;
const TEXT_INPUT_CLASS_NAME =
  "hidden my-auto mr-[1px] h-5/6 w-8 cursor-auto resize-none rounded-lg border border-solid border-setta-300/20 bg-white px-2 text-center font-mono text-xs focus-visible:border-blue-300 dark:border-setta-875 dark:bg-setta-875 dark:text-setta-300 @[132px]/slider:block";

function parseSliderValue(value: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    // Exact reference behavior: a malformed controlled value positions the Radix thumb at min;
    // malformed temporary field edits still revert to the controlled string on blur below.
    return min;
  }
  return clampNumericValue(parsed, min, max);
}

export function SliderValueControl({
  ariaLabel,
  sectionId,
  value,
  onValueChange,
  onValueCommit,
  min,
  max,
  step,
  disabled = false,
}: SliderValueControlProps) {
  assertNumericControlConfig("SliderValueControl", { min, max, step });
  const isSelectingItems = useItemSelectionMode((x) => x.isSelectingItems);
  const isDisabled = disabled || isSelectingItems;
  const numericValue = parseSliderValue(value, min, max);
  const reportChange = (nextValue: number) => onValueChange(String(nextValue));
  const reportCommit = (nextValue: number) => onValueCommit?.(String(nextValue));

  return (
    <div className={WRAPPER_CLASS_NAME}>
      <Slider.Root
        className={ROOT_CLASS_NAME}
        value={[numericValue]}
        min={min}
        max={max}
        step={step}
        disabled={isDisabled}
        onValueChange={(nextValues) => {
          const nextValue = nextValues[0];
          if (nextValue !== undefined) {
            reportChange(nextValue);
          }
        }}
        onValueCommit={(nextValues) => {
          const nextValue = nextValues[0];
          if (nextValue !== undefined) {
            reportCommit(nextValue);
          }
        }}
      >
        <Slider.Track className={TRACK_CLASS_NAME}>
          <Slider.Range className={RANGE_CLASS_NAME} />
        </Slider.Track>
        <Slider.Thumb
          aria-label={ariaLabel}
          className={THUMB_CLASS_NAME}
          onKeyDown={(event) => {
            if (event.code === "Escape") {
              focusSectionAfterEscape(sectionId);
            }
          }}
        />
      </Slider.Root>
      <SliderNumericField
        ariaLabel={`${ariaLabel} numeric value`}
        sectionId={sectionId}
        value={value}
        onValueChange={reportChange}
        onValueCommit={reportCommit}
        min={min}
        max={max}
        disabled={isDisabled}
      />
    </div>
  );
}

function SliderNumericField({
  ariaLabel,
  sectionId,
  value,
  onValueChange,
  onValueCommit,
  min,
  max,
  disabled,
}: {
  ariaLabel: string;
  sectionId: string;
  value: string;
  onValueChange: (nextValue: number) => void;
  onValueCommit: (nextValue: number) => void;
  min: number;
  max: number;
  disabled: boolean;
}) {
  const [temporaryValue, setTemporaryValue] = useState(value);

  useEffect(() => {
    setTemporaryValue(value);
  }, [value]);

  return (
    <input
      aria-label={ariaLabel}
      className={TEXT_INPUT_CLASS_NAME}
      inputMode="decimal"
      value={temporaryValue}
      disabled={disabled}
      onChange={(event) => setTemporaryValue(event.target.value)}
      onBlur={(event) => {
        const parsed = Number(event.target.value);
        if (event.target.value === "" || !Number.isFinite(parsed)) {
          setTemporaryValue(value);
          return;
        }
        const clamped = clampNumericValue(parsed, min, max);
        setTemporaryValue(String(clamped));
        onValueChange(clamped);
        onValueCommit(clamped);
      }}
      onKeyDown={(event) => {
        if (event.code === "Escape") {
          focusSectionAfterEscape(sectionId);
        }
      }}
    />
  );
}
