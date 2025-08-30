import { useCombobox, UseComboboxStateChange } from "downshift";
import { useComboboxStateReducerWithFilteredItems } from "./ComboboxStateReducer";
import { flattenedItems } from "./utils";

type ComboboxItemType = { id: string; name: string };

export type AllItemsType = Array<{
  group: string;
  items: Array<ComboboxItemType>;
}>;

export type OnSelectedItemChangeFnType = (id: string | null) => void;

export function useIdNameCombobox({
  allItems,
  onSelectedItemChange,
  value,
  selectedItemCanBeNull = false,
  clearInputAfterSelection = false,
}: {
  allItems: AllItemsType;
  onSelectedItemChange: OnSelectedItemChangeFnType;
  value: string | null;
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

  const localOnSelectedItemChange = ({
    selectedItem,
  }: UseComboboxStateChange<ComboboxItemType>) => {
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
