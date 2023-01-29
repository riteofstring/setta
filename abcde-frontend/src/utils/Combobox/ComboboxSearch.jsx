import { useCombobox } from "downshift";
import useWidthOfResizableElement from "hooks/useWidthOfResizableElement";
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
  // width,
  itemStyleGetter,
  small,
}) {
  const { widthRef, width } = useWidthOfResizableElement();
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
      className="flex h-10 w-full flex-col items-stretch overflow-visible"
      {...getComboboxProps({ ref: widthRef })}
    >
      <ComboboxInput
        getInputProps={getInputProps}
        getToggleButtonProps={getToggleButtonProps}
        isOpen={isOpen}
        small={small}
      />

      <div className="flex flex-col items-stretch" style={{ width }}>
        <ComboboxList isOpen={isOpen} getMenuProps={getMenuProps}>
          <div className="m-3 max-h-full w-full overflow-y-scroll">
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
