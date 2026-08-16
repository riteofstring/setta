import { useState } from "react";
import { BiHide, BiShow } from "react-icons/bi";
import { useItemSelectionModeForControl } from "../../document/itemSelectionMode";
import { NO_DRAG_CLASS_NAME, NO_PAN_CLASS_NAME } from "../../interaction";
import { handleSectionControlEscape } from "../sectionFocus";

// The remaining-controls milestone's password control: the frozen `PasswordInput` and its
// ordinary-row `ParamUI` wrapper behind the package's controlled string seam. The package owns
// only local obscured/visible presentation. A host that has a separately persisted secret may
// provide the optional reveal action and its pending state; the package never infers a saved
// secret from the value or placeholder and never stores credentials.

export type PasswordSavedValueAction = {
  pending: boolean;
  onReveal: () => void;
};

export type PasswordValueControlProps = {
  ariaLabel: string;
  sectionId: string;
  itemId: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  placeholder?: string;
  savedValueAction?: PasswordSavedValueAction;
  disabled?: boolean;
};

const WRAPPER_CLASS_NAME = "section-value flex min-w-0 items-center gap-2";
const INPUT_WRAPPER_CLASS_NAME = `section-value relative min-w-0 flex-1 ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME}`;
// Frozen main receives a transparent input background from its global `input { all: unset }`
// rule. The package cannot ship that host-wide reset, so both scoped password presentations carry
// the equivalent background explicitly.
const INPUT_BASE_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} peer/textinput flex w-full min-w-0 flex-1 self-center bg-transparent pe-8 font-mono text-xs text-[rgb(3,_47,_98);] dark:text-[rgb(165,_214,_255)]`;
const TOGGLE_BASE_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} absolute inset-y-0 end-0 grid w-8 place-items-center text-setta-400 dark:text-setta-500`;
const DIVIDER_BASE_CLASS_NAME =
  "section-value self-end border-b border-setta-200/50 dark:border-setta-600/30";
const META_WRAPPER_CLASS_NAME =
  "single-cell-container grid h-full min-h-0 w-full grid-cols-[1fr,auto]";
const META_INPUT_CLASS_NAME = `${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} single-cell-child flex h-full w-full min-w-0 max-w-[calc(100%_-_1.1rem)] cursor-text select-text self-center justify-self-start bg-transparent pe-8 font-mono text-xs text-[rgb(3,_47,_98);] dark:text-[rgb(165,_214,_255)]`;
const META_DIVIDER_CLASS_NAME =
  "single-cell-child border-box col-span-2 self-end border-b border-setta-200/50 dark:border-setta-600/30";

function getInputClassName(isDisabled: boolean) {
  return `${!isDisabled ? "cursor-text select-text" : ""} ${INPUT_BASE_CLASS_NAME}`;
}

function getDividerClassName(isSelectingItems: boolean) {
  return `${DIVIDER_BASE_CLASS_NAME} ${!isSelectingItems ? "peer-focus-within/textinput:border-blue-400" : ""}`;
}

function getToggleClassName(disabled: boolean) {
  const interactionClassName = disabled
    ? "cursor-not-allowed"
    : "cursor-pointer hover:text-setta-600 dark:hover:text-setta-300";
  return `${TOGGLE_BASE_CLASS_NAME} ${interactionClassName}`;
}

export function PasswordValueControl({
  ariaLabel,
  sectionId,
  itemId,
  value,
  onValueChange,
  placeholder,
  savedValueAction,
  disabled = false,
}: PasswordValueControlProps) {
  const isSelectingItems = useItemSelectionModeForControl();
  const isDisabled = disabled || isSelectingItems;

  return (
    <>
      <div className={WRAPPER_CLASS_NAME}>
        <PasswordInput
          ariaLabel={ariaLabel}
          sectionId={sectionId}
          itemId={itemId}
          value={value}
          onValueChange={onValueChange}
          placeholder={placeholder}
          disabled={isDisabled}
          inputClassName={getInputClassName(isDisabled)}
          wrapperClassName={INPUT_WRAPPER_CLASS_NAME}
        />
        {savedValueAction ? (
          <SavedValueRevealButton
            action={savedValueAction}
            disabled={isDisabled}
            sectionId={sectionId}
          />
        ) : null}
      </div>
      <span className={getDividerClassName(isSelectingItems)} />
    </>
  );
}

// Package-internal meta presentation. The obscured/visible state and keyboard behavior remain
// shared; only the full-area grid and frozen input/divider geometry differ from an item row.
export function MetaPasswordValueControl({
  ariaLabel,
  sectionId,
  controlId,
  value,
  onValueChange,
  placeholder,
  disabled = false,
}: Omit<PasswordValueControlProps, "itemId" | "savedValueAction"> & {
  controlId: string;
}) {
  const isSelectingItems = useItemSelectionModeForControl();
  const isDisabled = disabled || isSelectingItems;
  return (
    <div className={META_WRAPPER_CLASS_NAME}>
      <PasswordInput
        ariaLabel={ariaLabel}
        sectionId={sectionId}
        itemId={controlId}
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
        disabled={isDisabled}
        inputClassName={META_INPUT_CLASS_NAME}
        wrapperClassName="single-cell-child relative min-w-0"
      />
      <span className={META_DIVIDER_CLASS_NAME} />
    </div>
  );
}

function PasswordInput({
  ariaLabel,
  sectionId,
  itemId,
  value,
  onValueChange,
  placeholder,
  disabled,
  inputClassName,
  wrapperClassName,
}: {
  ariaLabel: string;
  sectionId: string;
  itemId: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  placeholder: string | undefined;
  disabled: boolean;
  inputClassName: string;
  wrapperClassName: string;
}) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className={wrapperClassName}>
      <input
        id={`${sectionId}-${itemId}-PasswordValueInput`}
        aria-label={ariaLabel}
        className={inputClassName}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        disabled={disabled}
        type={showPassword ? "text" : "password"}
        placeholder={placeholder}
        onKeyDown={(event) => handleSectionControlEscape(event, sectionId)}
      />
      <button
        type="button"
        onClick={() => setShowPassword((visible) => !visible)}
        aria-label={showPassword ? "Hide password" : "Show password"}
        className={getToggleClassName(disabled)}
        disabled={disabled}
        onKeyDown={(event) => handleSectionControlEscape(event, sectionId)}
        data-setta-workspace-touch-target="compact"
      >
        {showPassword ? (
          <BiShow aria-hidden="true" />
        ) : (
          <BiHide aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

function SavedValueRevealButton({
  action,
  disabled,
  sectionId,
}: {
  action: PasswordSavedValueAction;
  disabled: boolean;
  sectionId: string;
}) {
  const isDisabled = disabled || action.pending;
  return (
    <button
      type="button"
      className={`${isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"} ${NO_DRAG_CLASS_NAME} ${NO_PAN_CLASS_NAME} flex-none bg-transparent text-start font-mono text-xs text-setta-400 hover:text-setta-600 dark:text-setta-500 dark:hover:text-setta-300`}
      onClick={action.onReveal}
      disabled={isDisabled}
      aria-busy={action.pending}
      aria-label="Reveal saved password"
      title="Reveal saved password"
      onKeyDown={(event) => handleSectionControlEscape(event, sectionId)}
      data-setta-workspace-touch-target="compact"
    >
      {action.pending ? "Revealing..." : "Reveal"}
    </button>
  );
}
