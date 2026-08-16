import { useRef, useState, type KeyboardEvent } from "react";
import { useItemSelectionModeForControl } from "../../document/itemSelectionMode";
import { NO_DRAG_CLASS_NAME } from "../../interaction";
import {
  getElementTextDirection,
  type WorkspaceTextDirection,
} from "../../styles/textDirection";
import { ControlPopover } from "../popover/ControlPopover";
import {
  focusSectionAfterEscape,
  handleSectionControlEscape,
} from "../sectionFocus";

// The item-controls milestone's color picker: the reference `ColorPickerInput` at the `ParamUI`
// color presentation. With host-supplied choices it renders the recorded trigger — the rounded
// swatch, auto-contrast label, and chevron — over a portaled listbox of 16 px round swatches;
// without choices it renders the recorded native color input behind the eyedropper glyph. The
// reference's choice-configuration editor, theme-override props, and `onCommit` transport stay
// application-side; every pick reports once through the controlled string seam at the
// reference's cadence (each native input gesture, each listbox selection). The control
// disables from the host flag and, package-wide, while item-select mode is active.
//
// Two reference literals are trimmed where this build compiles nothing for them: the trigger's
// `colorpicker` hook (only the reference's draw-area/meta-control surfaces target it) and
// inert tokens that emit no CSS in either build (`min-w-0s`, and the label's
// `@[90px]:inline-block`, whose container query never matches on the params path because no
// ancestor establishes a container). Unlike the reference, the wrapper carries the package
// no-drag boundary: the milestone requires that editing never starts a section drag, and the
// package's drag filter exempts only that class.

export type ColorValueChoice = {
  color: string;
  description: string;
};

export type ColorValueControlProps = {
  ariaLabel: string;
  sectionId: string;
  itemId: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  choices?: Array<ColorValueChoice>;
  disabled?: boolean;
};

// The `ParamUI` placement wrapper and trigger literals plus the reference's default theme
// class strings.
const WRAPPER_CLASS_NAME = `${NO_DRAG_CLASS_NAME} section-value single-cell-container min-w-0 w-[calc(100%_-_2px)] justify-self-start self-center h-[calc(100%_-_4px)] min-h-0`;
const CHOICES_TRIGGER_CLASS_NAME =
  "flex-1 cursor-pointer items-center overflow-hidden rounded-lg single-cell-container h-full min-h-0 w-full min-w-0 items-center text-white";
const TRIGGER_SWATCH_CLASS_NAME =
  "single-cell-child m-auto h-full min-h-0 w-full rounded-lg !border !border-solid !border-setta-500/20 dark:!border-setta-500/40";
const MENU_CONTENT_CLASS_NAME =
  "z-50 flex flex-col rounded bg-white p-2 shadow-md dark:bg-setta-800";
const MENU_ITEM_CLASS_NAME =
  "flex cursor-pointer items-center rounded px-2 py-1 hover:bg-setta-100 dark:hover:bg-setta-700";
const MENU_ITEM_TEXT_CLASS_NAME =
  "max-w-48 truncate text-xs text-setta-500 dark:text-setta-300";
// The package-only reset marker recreates main's global input reset without touching controls
// supplied through the host renderer seam. The native-color marker scopes main's root
// color-swatch normalization to this package-owned input; the remaining classes are the native
// path verbatim.
const NATIVE_INPUT_CLASS_NAME =
  "setta-workspace-native-reset setta-workspace-native-color single-cell-child flex !h-[calc(100%_-_2px)] min-h-0 !w-[calc(100%_-_2px)] min-w-0 cursor-pointer items-center justify-between overflow-hidden !rounded-lg !border !border-solid !border-setta-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 dark:!border-setta-500/40";

// The reference's auto-contrast paint: the swatch color as background, flipped to black or
// white text by perceptual lightness (from https://codepen.io/devongovett/pen/QwLbRrW).
function getAutoContrastStyle(color: string) {
  return {
    "--bg": color,
    background: "var(--bg)",
    color: "lch(from var(--bg) calc((49.44 - l) * infinity) 0 0)",
  };
}

function resolveSelectedChoice(
  choices: Array<ColorValueChoice>,
  color: string,
): ColorValueChoice {
  const selected =
    choices.find((choice) => choice.color === color) ?? choices[0];
  if (!selected) {
    // Unreachable from the control: the choices path only renders when choices exist.
    throw new Error(
      "The color control cannot resolve a choice from an empty choice list.",
    );
  }
  return selected;
}

export function ColorValueControl({
  ariaLabel,
  sectionId,
  itemId,
  value,
  onValueChange,
  choices = [],
  disabled = false,
}: ColorValueControlProps) {
  const isSelectingItems = useItemSelectionModeForControl();
  const isDisabled = disabled || isSelectingItems;
  return (
    <div className={WRAPPER_CLASS_NAME}>
      {choices.length > 0 ? (
        <ColorChoicesPicker
          ariaLabel={ariaLabel}
          sectionId={sectionId}
          value={value}
          onValueChange={onValueChange}
          choices={choices}
          isDisabled={isDisabled}
        />
      ) : (
        <NativeColorPicker
          ariaLabel={ariaLabel}
          sectionId={sectionId}
          itemId={itemId}
          value={value}
          onValueChange={onValueChange}
          isDisabled={isDisabled}
        />
      )}
    </div>
  );
}

function NativeColorPicker({
  ariaLabel,
  sectionId,
  itemId,
  value,
  onValueChange,
  isDisabled,
}: {
  ariaLabel: string;
  sectionId: string;
  itemId: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  isDisabled: boolean;
}) {
  return (
    <>
      <i
        aria-hidden="true"
        className="gg-color-picker single-cell-child pointer-events-none me-0.5 mt-0.5 place-self-center"
        style={getAutoContrastStyle(value)}
      />
      <input
        aria-label={ariaLabel}
        // The reference's static `id="colorPicker"` duplicates across rows; the package keys
        // the id like the text control's dummy layer so every row stays host-addressable.
        id={`${sectionId}-${itemId}-ColorValueInput`}
        type="color"
        value={value}
        // The reference binds both `onInput` and React's `onChange` to the same native input
        // events, double-reporting each gesture into its idempotent app seam. The package seam
        // specifies one report per edit, so the control binds only React's value-tracked
        // `onChange`, which fires once per native input gesture and on the dialog's closing
        // change event when no input event already carried its value.
        onChange={(e) => onValueChange(e.target.value)}
        className={NATIVE_INPUT_CLASS_NAME}
        disabled={isDisabled}
        onKeyDown={(event) => handleSectionControlEscape(event, sectionId)}
      />
    </>
  );
}

function ColorChoiceOption({
  item,
  isSelected,
  isActive,
  buttonRef,
  onActive,
  onKeyDown,
  onSelect,
}: {
  item: ColorValueChoice;
  isSelected: boolean;
  isActive: boolean;
  buttonRef: (element: HTMLButtonElement | null) => void;
  onActive: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onSelect: (color: string) => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={isSelected}
      tabIndex={isActive ? 0 : -1}
      ref={buttonRef}
      className={MENU_ITEM_CLASS_NAME}
      onFocus={onActive}
      onKeyDown={onKeyDown}
      onClick={() => onSelect(item.color)}
    >
      <div
        aria-hidden="true"
        className="me-2 h-4 w-4 rounded-full"
        style={{ backgroundColor: item.color }}
      />
      <p className={MENU_ITEM_TEXT_CLASS_NAME}>{item.description}</p>
    </button>
  );
}

function ColorChoicesPicker({
  ariaLabel,
  sectionId,
  value,
  onValueChange,
  choices,
  isDisabled,
}: {
  ariaLabel: string;
  sectionId: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  choices: Array<ColorValueChoice>;
  isDisabled: boolean;
}) {
  const selectedItem = resolveSelectedChoice(choices, value);
  const selectedIndex = Math.max(
    choices.findIndex((choice) => choice.color === selectedItem.color),
    0,
  );
  const [isOpen, setIsOpen] = useState(false);
  const [direction, setDirection] = useState<WorkspaceTextDirection>("ltr");
  const [activeIndex, setActiveIndex] = useState(selectedIndex);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const restoreSectionFocusAfterClose = useRef(false);
  const changeOpen = (nextOpen: boolean) => {
    if (nextOpen) {
      setActiveIndex(selectedIndex);
      if (triggerRef.current) {
        setDirection(getElementTextDirection(triggerRef.current));
      }
    }
    setIsOpen(nextOpen);
  };
  const selectColor = (nextColor: string) => {
    onValueChange(nextColor);
    setIsOpen(false);
  };
  const focusOption = (nextIndex: number) => {
    setActiveIndex(nextIndex);
    optionRefs.current[nextIndex]?.focus({ preventScroll: true });
  };
  const handleOptionKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === "ArrowDown") {
      nextIndex = (index + 1) % choices.length;
    } else if (event.key === "ArrowUp") {
      nextIndex = (index - 1 + choices.length) % choices.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = choices.length - 1;
    }
    if (nextIndex === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    focusOption(nextIndex);
  };
  const labelStyle = getAutoContrastStyle(selectedItem.color);
  return (
    <ControlPopover
      open={isOpen}
      onOpenChange={changeOpen}
      direction={direction}
      contentClasses={MENU_CONTENT_CLASS_NAME}
      contentProps={{
        "aria-label": `${ariaLabel} choices`,
        align: "start",
        sideOffset: 6,
        style: { minWidth: "var(--radix-popover-trigger-width)" },
        onEscapeKeyDown: (event) => {
          event.stopPropagation();
          restoreSectionFocusAfterClose.current = true;
        },
        onCloseAutoFocus: (event) => {
          if (!restoreSectionFocusAfterClose.current) {
            return;
          }
          event.preventDefault();
          restoreSectionFocusAfterClose.current = false;
          focusSectionAfterEscape(sectionId);
        },
      }}
      trigger={
        <button
          ref={triggerRef}
          type="button"
          className={CHOICES_TRIGGER_CLASS_NAME}
          disabled={isDisabled}
          aria-label={`${ariaLabel}: ${selectedItem.description}`}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          onKeyDown={(event) => handleSectionControlEscape(event, sectionId)}
        >
          <div
            aria-hidden="true"
            className={TRIGGER_SWATCH_CLASS_NAME}
            style={{ backgroundColor: selectedItem.color }}
          />
          <div className="single-cell-child flex items-center justify-between overflow-hidden">
            <p
              className="ms-[2px] truncate ps-2.5 text-xs font-semibold"
              style={labelStyle}
            >
              {selectedItem.description}
            </p>
            <i
              aria-hidden="true"
              className="gg-chevron-down px-2"
              style={labelStyle}
            />
          </div>
        </button>
      }
    >
      <div
        role="listbox"
        aria-label={`${ariaLabel} choices`}
        className="flex flex-col"
      >
        {choices.map((item, index) => (
          <ColorChoiceOption
            key={index}
            item={item}
            isSelected={item.color === selectedItem.color}
            isActive={index === activeIndex}
            buttonRef={(element) => {
              optionRefs.current[index] = element;
            }}
            onActive={() => setActiveIndex(index)}
            onKeyDown={(event) => handleOptionKeyDown(event, index)}
            onSelect={selectColor}
          />
        ))}
      </div>
    </ControlPopover>
  );
}
