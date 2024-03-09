import { useCombobox } from "downshift";
import _ from "lodash";
import { useEffect, useState } from "react";
import { useComboboxStateReducerWithFilteredItems } from "./ComboboxStateReducer";
import { flattenedItems } from "./utils";

export function useIdNameCombobox({
  allItems,
  matchSorterProps,
  onSelectedItemChange,
  initialSelection,
  itemToString,
  inputCallback,
  onArrowUpOrDown,
}) {
  const [selection, setSelection] = useState(null);
  const { filteredItems, stateReducer } =
    useComboboxStateReducerWithFilteredItems({
      allItems,
      matchSorterProps,
      inputCallback,
      onArrowUpOrDown,
    });

  useEffect(() => {
    if (!_.isEqual(selection, initialSelection)) {
      onSelectedItemChange?.(selection, initialSelection, setSelection, false);
    }
  }, [initialSelection]);

  const localOnSelectedItemChange = ({ selectedItem }) => {
    onSelectedItemChange?.(selection, selectedItem, setSelection, true);
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

  const isReallyOpen = isOpen && singleListItems.length > 0;

  return {
    isOpen: isReallyOpen,
    filteredItems,
    getToggleButtonProps,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
  };
}

export function idNameHelper({
  allItems,
  onSelectedItemChange,
  initialSelection,
}) {
  const init =
    _.find(flattenedItems(allItems), { id: initialSelection }) ?? null;
  const itemToString = (x) => (x ? x.name : "");
  const matchSorterProps = { keys: ["name"] };

  const localOnSelectedItemChange = (
    currSelectedItem,
    newSelectedItem,
    setSelection,
    changedByUser
  ) => {
    const sid = newSelectedItem ? newSelectedItem.id : null;
    const currId = currSelectedItem ? currSelectedItem.id : null;
    if (sid !== currId) {
      setSelection(newSelectedItem);
    }
    if (sid !== initialSelection) {
      onSelectedItemChange(sid, changedByUser, setSelection);
    }
  };

  return {
    localOnSelectedItemChange,
    init,
    itemToString,
    matchSorterProps,
    onArrowUpOrDown: getValueFromHighlightedIndex,
  };
}

function getValueFromHighlightedIndex(latestItems, highlightedIndex) {
  if (highlightedIndex >= 0) {
    let idx = 0;
    for (const group of latestItems) {
      for (const item of group.items) {
        if (idx === highlightedIndex) {
          return { inputValue: item.name };
        }
        idx += 1;
      }
    }
  }
  return {};
}
