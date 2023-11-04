import { useCombobox } from "downshift";
import { useSizeOfResizableElement } from "hooks/useSizeOfResizableElement";
import _ from "lodash";
import { useEffect, useState } from "react";
import { ComboboxInput, ComboboxItem, ComboboxList } from "./Combobox";
import { useComboboxStateReducer } from "./ComboboxStateReducer";
import { flattenedItems } from "./utils";

// TODO: make allItems be a list of {group: string, items: list}
// TODO: add "display groups" argument
export function ComboboxSearch({
  allItems,
  initialSelection,
  itemToString,
  onSelectedItemChange,
  matchSorterProps,
  small,
  onClick,
  position,
  comboboxInputClasses,
  inputCallback,
}) {
  const {
    sizeRef,
    size: { width },
  } = useSizeOfResizableElement({ delay: 200 });

  const [selection, setSelection] = useState(null);
  const { filteredItems, stateReducer } = useComboboxStateReducer({
    allItems,
    matchSorterProps,
  });

  useEffect(() => {
    if (!_.isEqual(selection, initialSelection)) {
      onSelectedItemChange(selection, initialSelection, setSelection, false);
    }
  }, [initialSelection]);

  const localOnSelectedItemChange = ({ selectedItem }) => {
    onSelectedItemChange(selection, selectedItem, setSelection, true);
  };

  const singleListItems = flattenedItems(filteredItems);

  const {
    isOpen,
    getToggleButtonProps,
    getMenuProps,
    getInputProps,
    getComboboxProps,
    highlightedIndex,
    getItemProps,
  } = useCombobox({
    stateReducer,
    selectedItem: selection,
    items: singleListItems,
    itemToString,
    onSelectedItemChange: localOnSelectedItemChange,
  });

  const isReallyOpen = isOpen && singleListItems.length > 0;

  return (
    <div
      className={`flex ${
        small ? "h-7" : "h-10"
      } w-full flex-col items-stretch overflow-visible ${comboboxInputClasses}`}
      {...getComboboxProps({ ref: sizeRef })}
    >
      <ComboboxInput
        getInputProps={getInputProps}
        getToggleButtonProps={getToggleButtonProps}
        isOpen={isReallyOpen}
        small={small}
        onClick={onClick}
        inputCallback={inputCallback}
      />

      <ComboboxList
        isOpen={isReallyOpen}
        getMenuProps={getMenuProps}
        width={width}
        position={position}
      >
        <ComboboxItems
          filteredItems={filteredItems}
          getItemProps={getItemProps}
          highlightedIndex={highlightedIndex}
          itemToString={itemToString}
        />
      </ComboboxList>
    </div>
  );
}

function ComboboxItems({
  filteredItems,
  getItemProps,
  highlightedIndex,
  // itemStyleGetter,
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
