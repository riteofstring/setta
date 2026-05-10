import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import { autoUpdateGpuFloatingPosition } from "gpuFlow/portals/floatingPosition";
import React, { useLayoutEffect, useRef, useState } from "react";
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
  return bg?.trim().length ? bg : DEFAULT_BG_BY_VARIANT[variant];
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
  variant = "pill",
}: ComboboxInputProps) {
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
          {...(isPaneVariant ? { rounded: "rounded-md" } : {})}
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

type ComboboxInputProps = {
  readonly bg?: string | undefined;
  readonly divId?: string | undefined;
  readonly getInputProps: (options?: object, otherOptions?: object) => object;
  readonly getToggleButtonProps: (options?: object) => object;
  readonly inputOuterClasses?: string | undefined;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly inputThemeClassName?: string | undefined;
  readonly isDisabled?: boolean | undefined;
  readonly isOpen: boolean;
  readonly onKeyDown: React.KeyboardEventHandler<HTMLInputElement>;
  readonly placeholder?: string | undefined;
  readonly rightButtonThemeClassName?: string | undefined;
  readonly small: boolean;
  readonly variant?: ComboboxVariant | undefined;
};

export function ComboboxList({
  isOpen,
  children,
  getMenuProps,
  inputRef,
  listThemeClassName = "",
  portalContainerId,
  repositionOnCanvasTransform = false,
}: {
  isOpen: boolean;
  children: React.ReactNode;
  getMenuProps: (options?: object, otherOptions?: object) => object;
  inputRef: React.RefObject<HTMLInputElement | null>;
  listThemeClassName?: string | undefined;
  portalContainerId?: string | undefined;
  repositionOnCanvasTransform?: boolean | undefined;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [listStyle, setListStyle] = useState<React.CSSProperties>({
    left: "-9999px",
    opacity: 0,
    position: "fixed",
    top: "-9999px",
  });
  const display = isOpen ? "flex" : "hidden";
  const resolvedListThemeClassName = listThemeClassName
    ? ` ${listThemeClassName}`
    : "";

  useLayoutEffect(() => {
    if (!isOpen) {
      setListStyle({
        left: "-9999px",
        opacity: 0,
        position: "fixed",
        top: "-9999px",
      });
      return;
    }
    if (!inputRef.current || !listRef.current) {
      return;
    }
    return autoUpdateGpuFloatingPosition({
      floating: listRef.current,
      matchReferenceWidth: true,
      maxHeight: 384,
      offsetPx: 2,
      onPosition: setListStyle,
      placement: "bottom-start",
      reference: inputRef.current,
      repositionOnGpuViewportTransform: repositionOnCanvasTransform,
    });
  }, [inputRef, isOpen, repositionOnCanvasTransform]);

  if (typeof document === "undefined") {
    return null;
  }
  const portalContainer =
    portalContainerId === undefined
      ? document.body
      : document.getElementById(portalContainerId) ?? document.body;

  return createPortal(
    <div
      className={`nowheel nodrag w-fit pb-2 ${display} z-[80] rounded-md border bg-white shadow-xl dark:border-setta-700/70 dark:bg-setta-800 dark:text-setta-200 dark:shadow-setta-900/50${resolvedListThemeClassName}`}
      {...getMenuProps()}
      ref={listRef}
      style={{
        ...listStyle,
      }}
    >
      <div className="w-full overflow-y-scroll" role="presentation">
        {children}
      </div>
    </div>,
    portalContainer,
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
    <div
      className={`mx-1 cursor-pointer truncate rounded-lg px-2 py-[.125rem] text-xs ${bg} ${itemStyle}`}
      {...getItemProps({ item, index })}
    >
      {itemString}
    </div>
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
        <div aria-label={group.group} key={groupIndex} role="group">
          <div
            className={`mx-3 mb-1 truncate border-b border-solid border-setta-300/50 pt-3 text-[0.6rem] font-bold uppercase text-setta-600 first:pt-2 dark:text-setta-300${resolvedGroupHeaderThemeClassName}`}
            role="presentation"
          >
            {group.group}
          </div>
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
        </div>,
      );

      return result;
    },
    { groups: [], itemIndex: 0 },
  ).groups;
}
