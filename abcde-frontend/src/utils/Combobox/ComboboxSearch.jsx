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
  itemStyleGetter,
  small,
  onClick,
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
      onSelectedItemChange(selection, initialSelection, setSelection);
    }
  }, [initialSelection]);

  const localOnSelectedItemChange = ({ selectedItem }) => {
    onSelectedItemChange(selection, selectedItem, setSelection);
  };

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
    items: flattenedItems(filteredItems),
    itemToString,
    onSelectedItemChange: localOnSelectedItemChange,
  });

  return (
    <div
      className={`flex ${
        small ? "h-7" : "h-10"
      } w-full flex-col items-stretch overflow-visible`}
      {...getComboboxProps({ ref: sizeRef })}
    >
      <ComboboxInput
        getInputProps={getInputProps}
        getToggleButtonProps={getToggleButtonProps}
        isOpen={isOpen}
        small={small}
        onClick={onClick}
      />

      <div className="flex flex-col items-stretch">
        <ComboboxList isOpen={isOpen} getMenuProps={getMenuProps} width={width}>
          <div className="m-3 max-h-full w-full overflow-y-scroll">
            <ComboboxItems
              filteredItems={filteredItems}
              getItemProps={getItemProps}
              highlightedIndex={highlightedIndex}
              itemStyleGetter={itemStyleGetter}
              itemToString={itemToString}
            />
          </div>
        </ComboboxList>
      </div>
    </div>
  );
}

function ComboboxItems({
  filteredItems,
  getItemProps,
  highlightedIndex,
  itemStyleGetter,
  itemToString,
}) {
  return filteredItems.reduce(
    (result, group, groupIndex) => {
      result.groups.push(
        <div key={groupIndex}>
          <div>{group.group}</div>
          {group.items.map((item, itemIndex) => {
            const globalIndex = result.itemIndex++;
            return (
              <ComboboxItem
                getItemProps={getItemProps}
                item={item}
                index={globalIndex}
                isHighlighted={globalIndex === highlightedIndex}
                itemStyle={itemStyleGetter?.(item)}
                itemString={itemToString(item)}
                key={itemIndex}
              />
            );
          })}
        </div>
      );

      return result;
    },
    { groups: [], itemIndex: 0 }
  ).groups;
}
