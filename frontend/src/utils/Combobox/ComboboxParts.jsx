import React from "react";
import { createPortal } from "react-dom";
import { ScrollingArea } from "utils/atoms/scrollingarea/scrollingarea";
import { StandardSearch } from "utils/atoms/search/StandardSearch";

export function ComboboxInput({
  getInputProps,
  getToggleButtonProps,
  isOpen,
  small,
  onInputMouseDown,
  onInputClick,
  placeholder,
}) {
  const className =
    "nodrag flex-1 font-code z-[1] row-span-1 h-[calc(2rem-2px)] min-w-0 cursor-auto border border-solid rounded-full bg-runcoder-900/50 border-runcoder-300 px-4 font-mono text-xs text-white font-normal leading-normal outline-none placeholder:text-runcoder-300/25 dark:placeholder:text-runcoder-400/25 focus:text-clip focus-visible:border-blue-400 dark:border-runcoder-800 dark:caret-white dark:focus-visible:border-blue-400";

  return (
    <StandardSearch
      inputStyles={`flex-grow outline-0 cursor-auto bg-white dark:bg-runcoder-900 rounded-full shadow-sm text-xs font-mono text-runcoder-600 font-medium px-3 focus-visible:border-white dark:text-runcoder-300 dark:focus-visible:border-runcoder-900 focus-visible:ring-2 border border-solid border-runcoder-100 dark:border-runcoder-800 placeholder:text-runcoder-200 dark:placeholder:text-runcoder-700 min-w-0 ${
        small ? "h-6" : "h-7"
      }`}
      noLeftElement={true}
      placeholder={placeholder}
      // leftElementStyles="pl-3"
      {...getInputProps({
        onMouseDown: onInputMouseDown,
        onClick: onInputClick,
      })}
      // rightElement={
      //   <StandardSearchRightBtn
      //     {...getToggleButtonProps()}
      //     icon={
      //       isOpen ? (
      //         <i className="gg-chevron-up" />
      //       ) : (
      //         <i className="gg-chevron-down" />
      //       )
      //     }
      //     size={small ? "w-7 h-7" : "w-8 h-8"}
      //   />
      // }
    />
  );
}

export function ComboboxList({ isOpen, children, getMenuProps, listDims }) {
  const display = isOpen ? "flex" : "hidden";
  const { x, y, width } = listDims;

  // overflow-x-hidden overflow-y-scroll flex flex-col flex-1 items-stretch !overflow-visible

  return createPortal(
    <div
      className={`nowheel nodrag absolute w-full min-w-[40px] pb-2 ${display} z-20 mt-8 max-h-96  rounded-md border bg-white shadow-xl dark:border-runcoder-700/70 dark:bg-runcoder-800 dark:text-runcoder-200 dark:shadow-runcoder-900/50`}
      {...getMenuProps()}
      style={{ width, left: `${x}px`, top: `${y}px` }}
    >
      <ScrollingArea styles="w-full">{children}</ScrollingArea>
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
  const bg = isHighlighted ? "bg-runcoder-300/50 dark:bg-runcoder-900/50" : "";
  return (
    <dd
      className={`mx-1 cursor-pointer truncate rounded-lg px-2 py-[.125rem] text-xs ${bg} ${itemStyle}`}
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
          <dt className="mx-3 mb-1 truncate border-b border-solid border-runcoder-300/50 pt-3 text-[0.6rem] font-bold uppercase text-runcoder-400 first:pt-2">
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
