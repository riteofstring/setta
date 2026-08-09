import { useCombobox, type UseComboboxProps } from "downshift";
import { type KeyboardEvent } from "react";
import {
  flattenedItems,
  useComboboxStateReducerWithFilteredItems,
  type ComboboxItem,
  type ComboboxItemGroup,
  type OnSelectedItemChange,
} from "./comboboxStateReducer";

// The reference's `useIdNameCombobox` trimmed to the dropdown control: downshift wired to the
// corrected state reducer over the filtered choice groups, with the open flag gated on a
// non-empty filtered list. Escape blurs the input — the reference combobox contract; unlike the
// switch and color controls, the keypress keeps bubbling to the canvas Escape shortcut exactly
// as it does in main.
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

  const { filteredItems, stateReducer, selection } = useComboboxStateReducerWithFilteredItems(
    allItems,
    value,
    onSelectedItemChange,
  );

  const localOnSelectedItemChange: UseComboboxProps<ComboboxItem>["onSelectedItemChange"] = ({
    selectedItem,
  }) => {
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
