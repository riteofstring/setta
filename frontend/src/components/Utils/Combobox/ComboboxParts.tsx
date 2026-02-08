import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import React, { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { StandardSearchRightBtn } from "../atoms/search/StandardSearchRightBtn";

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
  variant = "pill",
}) {
  const isPaneVariant = variant === "pane";
  const resolvedBg =
    bg && bg.trim().length > 0
      ? bg
      : isPaneVariant
        ? "bg-white/80 dark:bg-setta-900"
        : "bg-white dark:bg-setta-900";
  const resolvedOuterClasses = [inputOuterClasses, isPaneVariant ? "mx-0" : ""]
    .filter(Boolean)
    .join(" ");
  const chevronScale = small ? 0.5 : 0.65;
  const chevronStyle = { "--ggs": chevronScale } as React.CSSProperties;
  const pillInputClasses = `flex-grow truncate outline-0 cursor-auto ${resolvedBg} rounded-full text-xs font-mono text-setta-600 font-medium pl-3 pr-6 focus-visible:border-white hover:bg-white/50 hover:dark:bg-setta-950 dark:text-setta-300 dark:focus-visible:border-setta-900 focus-visible:ring-2 border border-solid border-setta-100 dark:border-setta-700/70 placeholder:text-setta-200 dark:placeholder:text-setta-700 min-w-0 ${
    small ? "h-4 my-auto" : "h-7"
  }`;
  const paneInputClasses = `flex-grow truncate outline-0 cursor-auto ${resolvedBg} rounded-md border border-solid border-setta-200 px-2 pr-8 text-xs text-setta-800 placeholder:text-setta-300 focus:!border-blue-500 focus:outline-0 focus:ring-0 disabled:cursor-not-allowed disabled:bg-setta-100 dark:border-setta-700 dark:text-setta-300 dark:placeholder:text-setta-600 min-w-0 ${
    small ? "h-6" : "h-8"
  }`;
  const toggleIcon = isPaneVariant ? (
    <i
      className={`gg-chevron-down transition-transform duration-150 ${
        isOpen ? "rotate-180" : ""
      }`}
      style={chevronStyle}
    />
  ) : isOpen ? (
    <i className="gg-chevron-up" style={chevronStyle} />
  ) : (
    <i className="gg-chevron-down" style={chevronStyle} />
  );
  const rightButtonClassName = isPaneVariant
    ? "right-1 text-setta-500 hover:bg-setta-100 hover:text-setta-700 dark:text-setta-400 dark:hover:bg-setta-800 dark:hover:text-setta-100"
    : "right-1";
  return (
    <StandardSearch
      outerClasses={resolvedOuterClasses}
      inputStyles={isPaneVariant ? paneInputClasses : pillInputClasses}
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
          rounded={isPaneVariant ? "rounded-md" : undefined}
          className={rightButtonClassName}
          size={
            isPaneVariant
              ? small
                ? "h-5 w-5"
                : "h-6 w-6"
              : small
                ? "h-4 w-4"
                : "h-5 w-5"
          }
        />
      }
    />
  );
}

export function ComboboxList({
  isOpen,
  children,
  getMenuProps,
  inputRef,
}: {
  isOpen: boolean;
  children: React.ReactNode;
  getMenuProps: () => React.InputHTMLAttributes<HTMLInputElement>;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [listDims, setListDims] = useState({ x: 0, y: 0, width: 0 });
  const display = isOpen ? "flex" : "hidden";

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
      className={`nowheel nodrag absolute w-fit pb-2 ${display} z-[80] mt-8 max-h-96 rounded-md border bg-white shadow-xl dark:border-setta-700/70 dark:bg-setta-800 dark:text-setta-200 dark:shadow-setta-900/50`}
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
  itemString,
}) {
  const bg = isHighlighted ? "bg-setta-300/50 dark:bg-setta-900/50" : "";
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
}) {
  return filteredItems.reduce(
    (result, group, groupIndex) => {
      result.groups.push(
        <dl key={groupIndex}>
          <dt className="mx-3 mb-1 truncate border-b border-solid border-setta-300/50 pt-3 text-[0.6rem] font-bold uppercase text-setta-400 first:pt-2">
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
