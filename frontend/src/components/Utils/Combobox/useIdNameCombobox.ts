import { useCombobox, UseComboboxProps } from "downshift";
import {
  AllItemsType,
  ComboboxItemType,
  OnSelectedItemChangeFnType,
  useComboboxStateReducerWithFilteredItems,
} from "./ComboboxStateReducer";
import { flattenedItems } from "./utils";

// value doesn't have to be provided, for example if it's not a saved global state.
// value === null means no selection
export function useIdNameCombobox({
  allItems,
  onSelectedItemChange,
  value,
  selectedItemCanBeNull = false,
  clearInputAfterSelection = false,
}: {
  allItems: AllItemsType;
  onSelectedItemChange: OnSelectedItemChangeFnType;
  value?: string | null;
  selectedItemCanBeNull?: boolean;
  clearInputAfterSelection?: boolean;
}) {
  function onKeyDown(e) {
    if (e.code === "Escape") {
      // TODO: figure out best way to blur without being annoying
      // e.target.blur();
    }
  }

  const itemToString = (x: ComboboxItemType | null) => (x ? x.name : "");

  const { filteredItems, stateReducer, selection } =
    useComboboxStateReducerWithFilteredItems(
      allItems,
      value,
      onSelectedItemChange,
      selectedItemCanBeNull,
      clearInputAfterSelection,
    );

  const localOnSelectedItemChange: UseComboboxProps<ComboboxItemType>["onSelectedItemChange"] =
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
  } = useCombobox<ComboboxItemType>({
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
