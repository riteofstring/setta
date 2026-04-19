import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import React, { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";
import { StandardSearchRightBtn } from "../atoms/search/StandardSearchRightBtn";

type ComboboxVariant = "pill" | "pane";
type ComboboxSizeKey = "small" | "regular";

const DEFAULT_BG_BY_VARIANT: Record<ComboboxVariant, string> = {
  pane: "bg-white/80 dark:bg-setta-900",
  pill: "bg-white dark:bg-setta-900",
};

const INPUT_BASE_CLASSES_BY_VARIANT: Record<ComboboxVariant, string> = {
  pane: "flex-grow truncate outline-0 cursor-auto rounded-md border border-solid border-setta-200 px-2 pr-8 text-xs text-setta-800 placeholder:text-setta-300 focus:!border-blue-500 focus:outline-0 focus:ring-0 disabled:cursor-not-allowed disabled:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:placeholder:text-setta-600 min-w-0",
  pill: "flex-grow truncate outline-0 cursor-auto rounded-full text-xs font-mono text-setta-600 font-medium pl-3 focus-visible:border-white hover:bg-white/50 hover:dark:bg-setta-950 dark:text-setta-300 dark:focus-visible:border-setta-900 focus-visible:ring-2 border border-solid border-setta-100 dark:border-setta-700/70 placeholder:text-setta-200 dark:placeholder:text-setta-700 min-w-0",
};

const INPUT_SIZE_CLASSES_BY_VARIANT: Record<
  ComboboxVariant,
  Record<ComboboxSizeKey, string>
> = {
  pane: {
    regular: "h-8",
    small: "h-6",
  },
  pill: {
    regular: "pr-8 h-7",
    small: "pr-6 h-4 my-auto",
  },
};

const RIGHT_BUTTON_CLASS_BY_VARIANT: Record<ComboboxVariant, string> = {
  pane: "right-1 text-setta-500 hover:bg-setta-100 hover:text-setta-700 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-100",
  pill: "right-1",
};

const TOGGLE_BUTTON_SIZE_BY_VARIANT: Record<
  ComboboxVariant,
  Record<ComboboxSizeKey, string>
> = {
  pane: {
    regular: "h-6 w-6",
    small: "h-6 w-6",
  },
  pill: {
    regular: "h-7 w-7",
    small: "h-4 w-4",
  },
};

const TOGGLE_ICON_SIZE_BY_VARIANT: Record<
  ComboboxVariant,
  Record<ComboboxSizeKey, number>
> = {
  pane: {
    regular: 14,
    small: 12,
  },
  pill: {
    regular: 12,
    small: 10,
  },
};

function getComboboxSizeKey(small: boolean): ComboboxSizeKey {
  return small ? "small" : "regular";
}

function joinClasses(...classNames: Array<string | undefined>) {
  return classNames.filter(Boolean).join(" ");
}

function getResolvedComboboxBg(
  bg: string | undefined,
  variant: ComboboxVariant,
) {
  return bg && bg.trim().length > 0 ? bg : DEFAULT_BG_BY_VARIANT[variant];
}

function getComboboxInputStyles(
  variant: ComboboxVariant,
  small: boolean,
  bg: string | undefined,
  inputThemeClassName: string,
) {
  const sizeKey = getComboboxSizeKey(small);
  return joinClasses(
    INPUT_BASE_CLASSES_BY_VARIANT[variant],
    getResolvedComboboxBg(bg, variant),
    INPUT_SIZE_CLASSES_BY_VARIANT[variant][sizeKey],
    inputThemeClassName,
  );
}

function getComboboxToggleIcon(
  variant: ComboboxVariant,
  isOpen: boolean,
  small: boolean,
) {
  const size = TOGGLE_ICON_SIZE_BY_VARIANT[variant][getComboboxSizeKey(small)];
  if (variant === "pane") {
    return (
      <HiChevronDown
        className={joinClasses(
          "transition-transform duration-150",
          isOpen ? "rotate-180" : undefined,
        )}
        size={size}
      />
    );
  }
  const Icon = isOpen ? HiChevronUp : HiChevronDown;
  return <Icon size={size} />;
}

export function ComboboxInput({
  divId,
  getInputProps,
  getToggleButtonProps,
  isOpen,
  small,
  onKeyDown,
  placeholder,
  bg,
  isDisabled,
  inputRef,
  inputOuterClasses = "",
  inputThemeClassName = "",
  rightButtonThemeClassName = "",
  onBlur,
  variant = "pill",
}) {
  const sizeKey = getComboboxSizeKey(small);
  const isPaneVariant = variant === "pane";
  const resolvedOuterClasses = joinClasses(
    inputOuterClasses,
    isPaneVariant ? "mx-0" : undefined,
  );
  const toggleIcon = getComboboxToggleIcon(variant, isOpen, small);
  return (
    <StandardSearch
      outerClasses={resolvedOuterClasses}
      inputStyles={getComboboxInputStyles(
        variant,
        small,
        bg,
        inputThemeClassName,
      )}
      noLeftElement={true}
      placeholder={placeholder}
      // leftElementStyles="pl-3"
      {...getInputProps({
        id: divId,
        onBlur,
        onKeyDown,
        ref: inputRef,
        disabled: isDisabled,
      })}
      // rightElement={<i className="gg-spinner mr-1 text-blue-500/70" />}
      rightElement={
        <StandardSearchRightBtn
          {...getToggleButtonProps({
            disabled: isDisabled,
          })}
          icon={toggleIcon}
          rounded={isPaneVariant ? "rounded-md" : undefined}
          className={joinClasses(
            RIGHT_BUTTON_CLASS_BY_VARIANT[variant],
            rightButtonThemeClassName,
          )}
          size={TOGGLE_BUTTON_SIZE_BY_VARIANT[variant][sizeKey]}
        />
      }
    />
  );
}

export function CanvasOwnedRestingComboboxInput({
  bg,
  displayText,
  divId,
  inputOuterClasses = "",
  inputThemeClassName = "",
  isDisabled,
  onFocus,
  onMouseDownCapture,
  placeholder,
  rightButtonThemeClassName = "",
  rootClassName = "",
  small,
  variant = "pill",
}) {
  const sizeKey = getComboboxSizeKey(small);
  const isPaneVariant = variant === "pane";
  const resolvedOuterClasses = joinClasses(
    inputOuterClasses,
    isPaneVariant ? "mx-0" : undefined,
  );
  const resolvedDisplayText =
    typeof displayText === "string" && displayText.length > 0 ? displayText : "";
  const showPlaceholder =
    resolvedDisplayText.length === 0 &&
    typeof placeholder === "string" &&
    placeholder.length > 0;
  const displayValue = showPlaceholder ? placeholder : resolvedDisplayText;
  const placeholderClassName = showPlaceholder
    ? "text-setta-200 dark:text-setta-700"
    : undefined;

  return (
    <div
      className={joinClasses(
        "relative flex min-w-0 w-full items-center nodrag dark:text-setta-200",
        small ? "h-[20px]" : "h-8",
        rootClassName,
        "mx-[2px]",
        resolvedOuterClasses,
      )}
      data-canvas-owned-resting-dropdown-lightweight="true"
      id={divId}
      onFocus={onFocus}
      onMouseDownCapture={onMouseDownCapture}
      tabIndex={isDisabled ? -1 : 0}
    >
      <div
        className={joinClasses(
          getComboboxInputStyles(variant, small, bg, inputThemeClassName),
          "relative flex items-center opacity-0 outline-none",
          isDisabled ? "cursor-not-allowed" : undefined,
        )}
        data-canvas-owned-resting-dropdown-box="true"
      >
        <span
          className={joinClasses(
            "min-w-0 flex-grow truncate",
            placeholderClassName,
          )}
          data-canvas-owned-resting-text="true"
        >
          {displayValue || <br />}
        </span>
      </div>
      <div className="absolute inset-y-0 right-0 grid select-none place-items-center">
        <span
          aria-hidden="true"
          className={joinClasses(
            "nodrag grid select-none place-items-center justify-center rounded-full bg-transparent p-0 opacity-0",
            TOGGLE_BUTTON_SIZE_BY_VARIANT[variant][sizeKey],
            RIGHT_BUTTON_CLASS_BY_VARIANT[variant],
            rightButtonThemeClassName,
            placeholderClassName,
          )}
          data-canvas-owned-resting-text="true"
        >
          ▾
        </span>
      </div>
    </div>
  );
}

export function ComboboxList({
  isOpen,
  children,
  getMenuProps,
  inputRef,
  listThemeClassName = "",
}: {
  isOpen: boolean;
  children: React.ReactNode;
  getMenuProps: () => React.InputHTMLAttributes<HTMLInputElement>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  listThemeClassName?: string;
}) {
  const [listDims, setListDims] = useState({ x: 0, y: 0, width: 0 });
  const display = isOpen ? "flex" : "hidden";
  const resolvedListThemeClassName = listThemeClassName
    ? ` ${listThemeClassName}`
    : "";

  useLayoutEffect(() => {
    if (isOpen && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      const yMargin = -30;
      setListDims({
        x: rect.left,
        y: rect.bottom + yMargin,
        width: rect.width,
      });
    }
  }, [isOpen, inputRef]);

  return createPortal(
    <div
      className={`nowheel nodrag absolute w-fit pb-2 ${display} z-[80] mt-8 max-h-96 rounded-md border bg-white shadow-xl dark:border-setta-700/70 dark:bg-setta-800 dark:text-setta-200 dark:shadow-setta-900/50${resolvedListThemeClassName}`}
      {...getMenuProps()}
      style={{
        left: `${listDims.x}px`,
        top: `${listDims.y}px`,
        minWidth: listDims.width,
      }}
    >
      <div className="w-full overflow-y-scroll">{children}</div>
    </div>,
    document.body,
  );
}

function _ComboboxItem({
  getItemProps,
  item,
  index,
  isHighlighted,
  itemStyle = "",
  highlightedItemStyle = "",
  itemString,
}) {
  const bg = isHighlighted
    ? highlightedItemStyle || "bg-setta-300/50 dark:bg-setta-900/50"
    : "";
  return (
    <dd
      className={`mx-1 cursor-pointer truncate rounded-lg px-2 py-[.125rem] text-xs ${bg} ${itemStyle}`}
      {...getItemProps({ item, index })}
    >
      {itemString}
    </dd>
  );
}

const ComboboxItem = React.memo(_ComboboxItem);

export function ComboboxItems({
  filteredItems,
  getItemProps,
  highlightedIndex,
  itemToString,
  groupHeaderThemeClassName = "",
  itemThemeClassName = "",
  itemHighlightedThemeClassName = "",
}) {
  const resolvedGroupHeaderThemeClassName = groupHeaderThemeClassName
    ? ` ${groupHeaderThemeClassName}`
    : "";
  return filteredItems.reduce(
    (result, group, groupIndex) => {
      result.groups.push(
        <dl key={groupIndex}>
          <dt
            className={`mx-3 mb-1 truncate border-b border-solid border-setta-300/50 pt-3 text-[0.6rem] font-bold uppercase text-setta-400 first:pt-2${resolvedGroupHeaderThemeClassName}`}
          >
            {group.group}
          </dt>
          {group.items.map((item, itemIndex) => {
            const globalIndex = result.itemIndex++;
            return (
              <ComboboxItem
                getItemProps={getItemProps}
                item={item}
                index={globalIndex}
                isHighlighted={globalIndex === highlightedIndex}
                itemStyle={itemThemeClassName}
                highlightedItemStyle={itemHighlightedThemeClassName}
                itemString={itemToString ? itemToString(item) : item}
                key={itemIndex}
              />
            );
          })}
        </dl>,
      );

      return result;
    },
    { groups: [], itemIndex: 0 },
  ).groups;
}
