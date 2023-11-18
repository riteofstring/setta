import React, { useEffect } from "react";
import { HiChevronDown, HiChevronUp } from "react-icons/hi";
import { ScrollingArea } from "utils/atoms/scrollingarea/scrollingarea";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { StandardSearchRightBtn } from "utils/atoms/search/StandardSearchRightBtn";

export function ComboboxInput({
  getInputProps,
  getToggleButtonProps,
  isOpen,
  small,
  onClick,
  inputCallback,
}) {
  const toggleButtonProps = getToggleButtonProps({ onClick });
  const inputProps = getInputProps();

  useEffect(() => {
    if (inputCallback) {
      inputCallback(inputProps.value);
    }
  }, [inputProps.value]);

  return (
    <StandardSearch
      inputStyles={`flex-grow outline-0 cursor-auto bg-white dark:bg-runcoder-900 rounded-full shadow-sm text-sm pl-10 focus-visible:border-white dark:text-runcoder-200 dark:focus-visible:border-slate-900 focus-visible:ring-2 border border-solid border-slate-200 dark:border-runcoder-700 ${
        small ? "h-7" : "h-10"
      }`}
      leftElementStyles="pl-3"
      {...toggleButtonProps}
      {...inputProps}
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

  // overflow-x-hidden overflow-y-scroll flex flex-col flex-1 items-stretch !overflow-visible
  return (
    <div
      className={`nowheel nodrag relative w-full min-w-[150px] p-3 ${display} ${position} z-20 mt-2 max-h-96  rounded-3xl bg-white shadow-xl dark:bg-runcoder-700 dark:text-runcoder-200`}
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
          <dt className="mx-5 mb-2 truncate border-b border-solid border-slate-300 pt-5 pb-1 text-xs font-bold uppercase tracking-wider text-slate-400">
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
                itemString={itemToString(item)}
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
