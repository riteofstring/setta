import { useCombobox } from "downshift";
import { useState } from "react";
import { useComboboxStateReducerWithFilteredItems } from "./ComboboxStateReducer";
import { flattenedItems } from "./utils";

export function useIdNameCombobox({ allItems, onSelectedItemChange, value }) {
  const [listDims, setListDims] = useState({ x: 0, y: 0, width: 0 });

  function onInputClick(inputRef) {
    const rect = inputRef.getBoundingClientRect();
    const yMargin = -30;
    setListDims({ x: rect.left, y: rect.bottom + yMargin, width: rect.width });
  }

  function onKeyDown(e) {
    if (e.code === "Escape") {
      e.target.blur();
    }
  }

  const itemToString = (x) => (x ? x.name : "");

  const { filteredItems, stateReducer, selection } =
    useComboboxStateReducerWithFilteredItems(
      allItems,
      value,
      onSelectedItemChange,
    );

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
    itemToString,
    onInputClick,
    onKeyDown,
    listDims,
  };
}
