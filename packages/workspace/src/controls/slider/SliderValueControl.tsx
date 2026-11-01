import * as Slider from "@radix-ui/react-slider";
import { useEffect, useState } from "react";
import { useItemSelectionModeForControl } from "../../document/itemSelectionMode.js";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION,
  SETTA_PREVENT_SECTION_ACTIVE_CSS,
} from "../../interaction.js";
import {
  assertNumericControlConfig,
  clampNumericValue,
} from "../numeric/numericControlConfig.js";
import { handleSectionControlEscape } from "../sectionFocus.js";
import { useWorkspaceHost } from "../../workspaceHostContext.js";

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

const ITEM_WRAPPER_CLASS_NAME = `${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} cursor-pointer @container/slider section-value flex gap-1`;
const ITEM_ROOT_CLASS_NAME =
  "data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex w-full touch-none select-none items-center data-[orientation='horizontal']:h-5";
const ITEM_TRACK_CLASS_NAME =
  "relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700";
const RANGE_CLASS_NAME = "absolute h-full rounded-full bg-blue-500";
const ITEM_THUMB_CLASS_NAME = `${NO_DRAG_CLASS_NAME} block h-3 w-3 cursor-pointer rounded-full border-2 border-setta-300 bg-white shadow-sm drop-shadow-md hover:!bg-setta-100 hover:dark:!bg-setta-700 focus-visible:!border-blue-500 focus-visible:bg-blue-500 focus-visible:dark:bg-blue-700 focus-visible:outline-none dark:border-setta-400 dark:bg-setta-600 data-[disabled]:pointer-events-none`;
const ITEM_TEXT_INPUT_CLASS_NAME =
  "hidden my-auto me-[1px] h-5/6 cursor-auto resize-none rounded-lg border border-solid border-setta-300/20 bg-white px-2 text-center font-mono text-xs tabular-nums focus-visible:border-blue-300 dark:border-setta-875 dark:bg-setta-875 dark:text-setta-300 @[132px]/slider:!block";
const META_WRAPPER_CLASS_NAME = `${SETTA_PREVENT_SECTION_ACTIVE_CSS} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} flex w-full min-w-0 items-center gap-2 cursor-pointer`;
const META_ROOT_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} data[orientation='vertical']:flex-col data[orientation='vertical']:w-5 data[orientation='vertical']:h-24 SliderRoot relative flex w-full flex-1 touch-none select-none items-center data-[orientation='horizontal']:h-5 cursor-pointer`;
const META_TRACK_CLASS_NAME = `${NO_DRAG_CLASS_NAME} relative flex-grow rounded-full bg-setta-200 data-[orientation='horizontal']:h-[3px] data-[orientation='vertical']:w-[3px] dark:bg-setta-700 cursor-pointer`;
const META_THUMB_CLASS_NAME = `${SETTA_PREVENT_ARROW_KEYS_MOVING_SECTION} ${NO_DRAG_CLASS_NAME} block h-3 w-3 cursor-pointer rounded-full border-2 border-setta-300 bg-white shadow-sm hover:!bg-setta-100 dark:border-setta-400 dark:bg-setta-600`;

type SliderPresentation = "item-row" | "meta-control";

function getSliderPresentation(presentation: SliderPresentation) {
  if (presentation === "meta-control") {
    return {
      wrapperClassName: META_WRAPPER_CLASS_NAME,
      rootClassName: META_ROOT_CLASS_NAME,
      trackClassName: META_TRACK_CLASS_NAME,
      thumbClassName: META_THUMB_CLASS_NAME,
      textInputClassName: "hidden",
    };
  }
  return {
    wrapperClassName: ITEM_WRAPPER_CLASS_NAME,
    rootClassName: ITEM_ROOT_CLASS_NAME,
    trackClassName: ITEM_TRACK_CLASS_NAME,
    thumbClassName: ITEM_THUMB_CLASS_NAME,
    textInputClassName: ITEM_TEXT_INPUT_CLASS_NAME,
  };
}

function parseSliderValue(value: string, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return clampNumericValue(parsed, min, max);
}

function getDecimalPlaces(value: number): number {
  const [coefficient = "", exponentText] = String(Math.abs(value))
    .toLowerCase()
    .split("e");
  const fractionLength = coefficient.split(".")[1]?.length ?? 0;
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  return Math.max(0, fractionLength - exponent);
}

function getNumericFieldCharacterCount(
  min: number,
  max: number,
  step: number,
): number {
  const precision = Math.max(
    getDecimalPlaces(min),
    getDecimalPlaces(max),
    getDecimalPlaces(step),
  );
  const largestMagnitude = Math.max(Math.abs(min), Math.abs(max));
  const integerDigits =
    largestMagnitude < 1 ? 1 : Math.floor(Math.log10(largestMagnitude)) + 1;
  const signCharacters = min < 0 ? 1 : 0;
  const fractionalCharacters = precision === 0 ? 0 : precision + 1;
  return Math.max(
    String(min).length,
    String(max).length,
    signCharacters + integerDigits + fractionalCharacters,
  );
}

export function SliderValueControl({ ...props }: SliderValueControlProps) {
  return <SliderValueControlCore {...props} presentation="item-row" />;
}

export function MetaSliderValueControl(props: SliderValueControlProps) {
  return <SliderValueControlCore {...props} presentation="meta-control" />;
}

function SliderValueControlCore({
  ariaLabel,
  sectionId,
  value,
  onValueChange,
  onValueCommit,
  min,
  max,
  step,
  disabled = false,
  presentation,
}: SliderValueControlProps & { presentation: SliderPresentation }) {
  const host = useWorkspaceHost();
  assertNumericControlConfig("SliderValueControl", { min, max, step });
  const isSelectingItems = useItemSelectionModeForControl();
  const isDisabled = disabled || isSelectingItems;
  const numericValue = parseSliderValue(value, min, max);
  const numericFieldCharacterCount = getNumericFieldCharacterCount(
    min,
    max,
    step,
  );
  const classes = getSliderPresentation(presentation);
  const reportChange = (nextValue: number) => onValueChange(String(nextValue));
  const reportCommit = (nextValue: number) =>
    onValueCommit?.(String(nextValue));

  return (
    <div className={classes.wrapperClassName}>
      <Slider.Root
        className={classes.rootClassName}
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
        data-setta-workspace-touch-target="gesture-inline"
      >
        <Slider.Track className={classes.trackClassName}>
          <Slider.Range className={RANGE_CLASS_NAME} />
        </Slider.Track>
        <Slider.Thumb
          aria-label={ariaLabel}
          className={classes.thumbClassName}
          onKeyDown={(event) =>
            handleSectionControlEscape(host, event, sectionId)
          }
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
        className={classes.textInputClassName}
        characterCount={numericFieldCharacterCount}
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
  className,
  characterCount,
}: {
  ariaLabel: string;
  sectionId: string;
  value: string;
  onValueChange: (nextValue: number) => void;
  onValueCommit: (nextValue: number) => void;
  min: number;
  max: number;
  disabled: boolean;
  className: string;
  characterCount: number;
}) {
  const host = useWorkspaceHost();
  const [temporaryValue, setTemporaryValue] = useState(value);

  useEffect(() => {
    setTemporaryValue(value);
  }, [value]);

  return (
    <input
      aria-label={ariaLabel}
      className={className}
      inputMode="decimal"
      style={{ inlineSize: `calc(${characterCount}ch + 1rem + 2px)` }}
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
      onKeyDown={(event) => handleSectionControlEscape(host, event, sectionId)}
    />
  );
}
