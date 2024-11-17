import { useCombobox } from "downshift";
import _ from "lodash";
import { useEffect, useState } from "react";
import { useComboboxStateReducerWithFilteredItems } from "./ComboboxStateReducer";
import { flattenedItems } from "./utils";

export function useIdNameCombobox({
  allItems,
  onSelectedItemChange,
  value,
  itemToString,
}) {
  const trueValue = _.find(flattenedItems(allItems), { id: value }) ?? null;
  const [selection, setSelection] = useState(null);
  const { filteredItems, stateReducer } =
    useComboboxStateReducerWithFilteredItems(allItems);

  useEffect(() => {
    if (!_.isEqual(selection, trueValue)) {
      setSelection(trueValue);
    }
  }, [trueValue]);

  const localOnSelectedItemChange = ({ selectedItem }) => {
    onSelectedItemChange(selectedItem ? selectedItem.id : null);
  };

  const singleListItems = flattenedItems(filteredItems);

  const {
    isOpen,
    getToggleButtonProps,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
  } = useCombobox({
    stateReducer,
    selectedItem: selection,
    items: singleListItems,
    itemToString,
    onSelectedItemChange: localOnSelectedItemChange,
  });

  return {
    isOpen: isOpen && singleListItems.length > 0,
    filteredItems,
    getToggleButtonProps,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
  };
}
