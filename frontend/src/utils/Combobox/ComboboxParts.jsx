import React from "react";
import { HiChevronDown, HiChevronUp } from "react-icons/hi";
import { ScrollingArea } from "utils/atoms/scrollingarea/scrollingarea";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { StandardSearchRightBtn } from "utils/atoms/search/StandardSearchRightBtn";

export function ComboboxInput({
  getInputProps,
  getToggleButtonProps,
  isOpen,
  small,
  onInputMouseDown,
}) {
  return (
    <StandardSearch
      inputStyles={`flex-grow outline-0 cursor-auto bg-white dark:bg-runcoder-900 rounded-full shadow-sm text-xs text-runcoder-600 font-medium pl-9 focus-visible:border-white dark:text-runcoder-300 dark:focus-visible:border-runcoder-900 focus-visible:ring-2 border border-solid border-runcoder-200 dark:border-runcoder-700 ${
        small ? "h-7" : "h-9"
      }`}
      leftElementStyles="pl-3"
      {...getInputProps({ onMouseDown: onInputMouseDown })}
      rightElement={
        <StandardSearchRightBtn
          {...getToggleButtonProps()}
          icon={isOpen ? <HiChevronUp /> : <HiChevronDown />}
          size={small ? "w-7 h-7" : "w-9 h-9"}
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

  // overflow-x-hidden overflow-y-scroll flex flex-col flex-1 items-stretch !overflow-visible
  return (
    <div
      className={`nowheel nodrag relative w-full min-w-[150px] px-1 pt-1 pb-2 ${display} ${position} z-20 mt-1 max-h-96  rounded-2xl border bg-white shadow-xl dark:border-runcoder-700 dark:bg-runcoder-800 dark:text-runcoder-200 dark:shadow-runcoder-900/50`}
      {...getMenuProps()}
      style={{ width }}
    >
      <ScrollingArea styles="w-full">{children}</ScrollingArea>
    </div>
  );
}

export function ComboboxTextFieldList({
  isOpen,
  children,
  getMenuProps,
  width,
  position = "fixed",
}) {
  const display = isOpen ? "flex" : "hidden";

  return (
    <div
      className={`nowheel nodrag fixed w-full min-w-[150px] px-1 pt-1 pb-2 ${display} ${position} z-20 mt-6 max-h-96  rounded-2xl border bg-white shadow-sm dark:border-runcoder-500/20 dark:bg-runcoder-800 dark:text-runcoder-200 dark:shadow-md dark:shadow-runcoder-900/75`}
      {...getMenuProps()}
      style={{ width }}
    >
      <ScrollingArea styles="w-full">{children}</ScrollingArea>
    </div>
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
  const bg = isHighlighted ? "bg-runcoder-300/50 dark:bg-runcoder-800/50l" : "";
  return (
    <dd
      className={`mx-1 cursor-pointer truncate rounded-xl px-2 py-1 text-xs ${bg} ${itemStyle}`}
      {...getItemProps({ item, index })}
      data-testid={"ComboboxListItem"}
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
          <dt className="mx-3 mb-1 truncate border-b border-solid border-runcoder-300/50 pt-3 pb-1 text-[0.6rem] font-bold uppercase text-runcoder-400">
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
        </dl>
      );

      return result;
    },
    { groups: [], itemIndex: 0 }
  ).groups;
}
