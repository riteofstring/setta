import React from "react";
import { HiChevronDown, HiChevronUp } from "react-icons/hi";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { StandardSearchRightBtn } from "utils/atoms/search/StandardSearchRightBtn";

export function ComboboxInput({
  getInputProps,
  getToggleButtonProps,
  isOpen,
  small,
  onClick,
}) {
  const toggleButtonProps = getToggleButtonProps({ onClick });

  return (
    <StandardSearch
      inputStyles={`flex-grow outline-0 cursor-auto bg-white rounded-full shadow-sm text-sm pl-10 focus-visible:border-white focus-visible:ring-2 border border-solid border-slate-200 ${
        small ? "h-7" : "h-10"
      }`}
      leftElementStyles="pl-3"
      {...toggleButtonProps}
      {...getInputProps()}
      rightElement={
        <StandardSearchRightBtn
          {...toggleButtonProps}
          icon={isOpen ? <HiChevronUp /> : <HiChevronDown />}
          size={small ? "w-7 h-7" : "w-10 h-10"}
        />
      }
    />
  );
}

export function ComboboxList({
  isOpen,
  children,
  getMenuProps,
  width,
  position = "fixed",
}) {
  const display = isOpen ? "flex" : "hidden";

  return (
    <dl
      className={`nowheel nodrag relative flex w-full min-w-[150px] flex-col overflow-x-hidden overflow-y-scroll p-3 ${display} ${position} z-20 mt-2 max-h-96 flex-1 items-stretch !overflow-visible rounded-3xl bg-white shadow-xl`}
      {...getMenuProps()}
      style={{ width }}
    >
      {children}
    </dl>
  );
}

function _ComboboxItem({
  getItemProps,
  item,
  index,
  isHighlighted,
  itemStyle,
  itemString,
}) {
  const bg = isHighlighted ? "bg-slate-100" : "";
  return (
    <dd
      className={`mx-1 my-0.5 cursor-pointer truncate rounded-xl px-4 py-2 text-sm ${bg} ${itemStyle}`}
      {...getItemProps({ item, index })}
      data-testid={"ComboboxListItem"}
    >
      {itemString}
    </dd>
  );
}

export const ComboboxItem = React.memo(_ComboboxItem);
