import { useCombobox, type UseComboboxProps } from "downshift";
import { type KeyboardEvent } from "react";
import {
  flattenedItems,
  useComboboxStateReducerWithFilteredItems,
  type ComboboxItem,
  type ComboboxItemGroup,
  type OnSelectedItemChange,
} from "./comboboxStateReducer.js";

export function useDropdownCombobox({
  allItems,
  value,
  onSelectedItemChange,
}: {
  allItems: Array<ComboboxItemGroup>;
  value: string | null;
  onSelectedItemChange: OnSelectedItemChange;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.code === "Escape") {
      e.currentTarget.blur();
    }
  }

  const itemToString = (x: ComboboxItem | null) => (x ? x.name : "");

  const { filteredItems, stateReducer, selection } =
    useComboboxStateReducerWithFilteredItems(
      allItems,
      value,
      onSelectedItemChange,
    );

  const localOnSelectedItemChange: UseComboboxProps<ComboboxItem>["onSelectedItemChange"] =
    ({ selectedItem }) => {
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
  } = useCombobox<ComboboxItem>({
    stateReducer,
    selectedItem: selection,
    items: singleListItems,
    isItemDisabled: (item) => item.disabled ?? false,
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
    onKeyDown,
  };
}
