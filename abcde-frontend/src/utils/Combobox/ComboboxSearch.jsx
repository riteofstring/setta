import { useCombobox } from "downshift";
import useSizeOfResizableElement from "hooks/useSizeOfResizableElement";
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
  itemStyleGetter,
  small,
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
    items: filteredItems,
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
      />

      <div className="flex flex-col items-stretch">
        <ComboboxList isOpen={isOpen} getMenuProps={getMenuProps} width={width}>
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
