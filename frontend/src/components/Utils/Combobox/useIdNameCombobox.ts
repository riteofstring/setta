import { useCombobox, UseComboboxProps } from "downshift";
import { type KeyboardEvent } from "react";
import {
  AllItemsType,
  ComboboxItemType,
  OnSelectedItemChangeFnType,
  useComboboxStateReducerWithFilteredItems,
} from "./ComboboxStateReducer";
import { flattenedItems } from "./utils";

// value doesn't have to be provided, for example if it's not a saved global state.
// value === null means no selection
export function useIdNameCombobox<T>({
  allItems,
  onSelectedItemChange,
  value,
  selectedItemCanBeNull = false,
  clearInputAfterSelection = false,
}: {
  allItems: AllItemsType<T>;
  onSelectedItemChange: OnSelectedItemChangeFnType<T>;
  value?: string | null;
  selectedItemCanBeNull?: boolean;
  clearInputAfterSelection?: boolean;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.code === "Escape") {
      // TODO: figure out best way to blur without being annoying
      e.currentTarget.blur();
    }
  }

  const itemToString = (x: ComboboxItemType<T> | null) => (x ? x.name : "");

  const { filteredItems, stateReducer, selection } =
    useComboboxStateReducerWithFilteredItems(
      allItems,
      value,
      onSelectedItemChange,
      selectedItemCanBeNull,
      clearInputAfterSelection,
    );

  const localOnSelectedItemChange: UseComboboxProps<
    ComboboxItemType<T>
  >["onSelectedItemChange"] = ({ selectedItem }) => {
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
    openMenu,
  } = useCombobox<ComboboxItemType<T>>({
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
    onKeyDown,
    openMenu,
  };
}
