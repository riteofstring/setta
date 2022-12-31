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
    <div
      className="flex flex-col items-stretch overflow-visible w-full h-10"
      {...getComboboxProps()}
    >
      <ComboboxInput
        {...getInputProps()}
        toggleButtonProps={getToggleButtonProps()}
        isOpen={isOpen}
      />

      <div className="flex flex-col items-stretch" style={{ width }}>
        <ComboboxList isOpen={isOpen} {...getMenuProps()}>
          <div className="max-h-full m-3 w-full overflow-y-scroll">
            {filteredItems.map((item, index) => (
              <ComboboxItem
                {...getItemProps({ item, index })}
                itemIndex={index}
                highlightedIndex={highlightedIndex}
                key={index}
                itemStyle={itemStyleGetter?.(item)}
              >
                {itemToString(item)}
              </ComboboxItem>
            ))}
          </div>
        </ComboboxList>
      </div>
    </div>
  );
}
