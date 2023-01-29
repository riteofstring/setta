import { useCombobox } from "downshift";
import _ from "lodash";
import { useEffect, useState } from "react";
import { ComboboxInput, ComboboxItem, ComboboxList } from "./Combobox";
import { useComboboxStateReducer } from "./ComboboxStateReducer";

export function ComboboxSearch({
  allItems,
  initialSelection,
  itemToString,
  onSelectedItemChange,
  matchSorterProps,
  width,
  small,
  itemStyleGetter,
}) {
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
    items: filteredItems,
    itemToString,
    onSelectedItemChange: localOnSelectedItemChange,
  });

  return (
    <div className={`relative`} style={{ width }} {...getComboboxProps()}>
      <ComboboxInput
        getInputProps={getInputProps}
        getToggleButtonProps={getToggleButtonProps}
        isOpen={isOpen}
        small={small}
      />
      <div className="absolute w-[inherit]">
        <ComboboxList isOpen={isOpen} getMenuProps={getMenuProps}>
          <div
            className="max-h-full m-3 overflow-y-scroll flex-1"
            // style={{ width: wMinusPad }}
          >
            {filteredItems.map((item, index) => (
              <ComboboxItem
                getItemProps={getItemProps}
                item={item}
                index={index}
                isHighlighted={index === highlightedIndex}
                itemStyle={itemStyleGetter?.(item)}
                itemString={itemToString(item)}
                key={index}
              />
            ))}
          </div>
        </ComboboxList>
      </div>
    </div>
  );
}
