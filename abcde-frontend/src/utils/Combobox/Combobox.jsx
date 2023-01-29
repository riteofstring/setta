import React from "react";
import { HiChevronDown, HiChevronUp } from "react-icons/hi";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { StandardSearchRightBtn } from "utils/atoms/search/StandardSearchRightBtn";

export function ComboboxInput({
  getInputProps,
  getToggleButtonProps,
  isOpen,
  small,
}) {
  const searchStyles =
    "w-full outline-0 cursor-auto bg-white rounded-full shadow-sm text-sm pl-10 focus-visible:ring-2";

  const toggleButtonProps = getToggleButtonProps();

  return (
    <StandardSearch
      inputStyles={`${searchStyles} + ${small ? "h-7" : "h-10"}`}
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

export function ComboboxList({ isOpen, children, getMenuProps }) {
  const display = isOpen ? "flex" : "hidden";
  return (
    <div
      className={`nowheel nodrag ${display} fixed z-20 mt-2 max-h-96 w-[inherit] flex-1 items-stretch !overflow-visible rounded-3xl bg-white shadow-xl`}
      {...getMenuProps()}
    >
      {children}
    </div>
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
  const bg = isHighlighted ? "bg-gray-100" : "";
  return (
    <div
      className={`mx-1 my-0.5 cursor-pointer rounded-xl px-4 py-2 ${bg} ${itemStyle}`}
      {...getItemProps({ item, index })}
      data-testid={"ComboboxListItem"}
    >
      {itemString}
    </div>
  );
}

export const ComboboxItem = React.memo(_ComboboxItem);
