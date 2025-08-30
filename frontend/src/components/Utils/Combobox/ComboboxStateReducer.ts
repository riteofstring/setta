import {
  useCombobox,
  UseComboboxProps,
  UseComboboxState,
  UseComboboxStateChangeTypes,
} from "downshift";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { flattenedItems } from "./utils";

export type ComboboxItemType = { id: string; name: string };

export type AllItemsType = Array<{
  group: string;
  items: Array<ComboboxItemType>;
}>;

export type OnSelectedItemChangeFnType = (id: string | null) => void;

function resetToPreviousVal(state: UseComboboxState<ComboboxItemType>) {
  return {
    selectedItem: state.selectedItem,
    inputValue: state.selectedItem === null ? "" : state.selectedItem.name,
  };
}

function setSelectedItemToNull() {
  return {
    selectedItem: null,
    inputValue: "",
  };
}

function getHighlightedIndex(
  items: AllItemsType,
  selectedItem: UseComboboxState<ComboboxItemType>["selectedItem"] | undefined,
  selectedItemCanBeNull: boolean,
  inputValue: string | undefined,
) {
  if (
    (selectedItemCanBeNull && inputValue === "") ||
    selectedItem === undefined
  ) {
    // if selectedItemCanBeNull, then we want to indicate that
    // an empty string and pressing Enter will make the selected item null
    return { highlightedIndex: -1 };
  }
  if (selectedItem) {
    let idx = 0;
    for (const group of items) {
      const currIdx = _.findIndex(group.items, selectedItem);
      if (currIdx !== -1) {
        return { highlightedIndex: idx + currIdx };
      }
      idx += group.items.length;
    }
  }
  return { highlightedIndex: -1 };
}

function getValueFromHighlightedIndex(
  latestItems: AllItemsType,
  highlightedIndex: number | undefined,
) {
  if (highlightedIndex === undefined) {
    return {};
  }
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

function getExactMatch(
  latestItems: AllItemsType,
  value: string | null,
  key: string,
) {
  return _.find(flattenedItems(latestItems), { [key]: value }) ?? null;
}

function getFirstMatch(latestItems: AllItemsType) {
  return flattenedItems(latestItems)[0];
}

function maybeClearInput(clearInputAfterSelection: boolean) {
  if (clearInputAfterSelection) {
    return { inputValue: "" };
  }
  return {};
}

function handleEnter(
  highlightedIndex: number,
  clearInputAfterSelection: boolean,
  inputValue: string,
  items: AllItemsType,
  selectedItemCanBeNull: boolean,
  state: UseComboboxState<ComboboxItemType>,
) {
  if (highlightedIndex !== -1) {
    return maybeClearInput(clearInputAfterSelection);
  }
  // only do the following if no item is highlighted
  if (inputValue) {
    const objContainingValue = getFirstMatch(items);
    if (objContainingValue) {
      return {
        selectedItem: objContainingValue,
        inputValue: clearInputAfterSelection ? "" : objContainingValue.name,
      };
    }
  }
  if (selectedItemCanBeNull) {
    // this allows the user to make the combobox empty again,
    // by deleting the text and pressing Enter.
    return setSelectedItemToNull();
  }
  return resetToPreviousVal(state);
}

function getReducerModifications(
  type: UseComboboxStateChangeTypes,
  state: UseComboboxState<ComboboxItemType>,
  changes: Partial<UseComboboxState<ComboboxItemType>>,
  items: AllItemsType,
  selectedItemCanBeNull: boolean,
  clearInputAfterSelection: boolean,
): Partial<UseComboboxState<ComboboxItemType>> {
  const changeTypes = useCombobox.stateChangeTypes;

  switch (type) {
    case changeTypes.InputChange:
    case changeTypes.ToggleButtonClick:
      return getHighlightedIndex(
        items,
        changes.selectedItem,
        selectedItemCanBeNull,
        changes.inputValue,
      );
    case changeTypes.InputKeyDownEscape:
    case changeTypes.InputBlur:
      return resetToPreviousVal(state);
    case changeTypes.InputKeyDownArrowUp:
    case changeTypes.InputKeyDownArrowDown:
      return getValueFromHighlightedIndex(items, changes.highlightedIndex);
    case changeTypes.InputKeyDownEnter:
      return handleEnter(
        state.highlightedIndex,
        clearInputAfterSelection,
        state.inputValue,
        items,
        selectedItemCanBeNull,
        state,
      );
    case changeTypes.ItemClick:
      return maybeClearInput(clearInputAfterSelection);
    default:
      return {};
  }
}

export function useComboboxStateReducerWithFilteredItems(
  allItems: AllItemsType,
  value: string | null | undefined,
  setValue: OnSelectedItemChangeFnType,
  selectedItemCanBeNull: boolean,
  clearInputAfterSelection: boolean,
) {
  const [selection, setSelection] = useState(null);
  const [filteredItems, setFilteredItems] = useState(allItems);

  useDeepCompareEffect(() => {
    setFilteredItems(allItems);
    if (value !== undefined) {
      const objContainingValue = getExactMatch(allItems, value, "id");
      if (!_.isEqual(selection, objContainingValue)) {
        setSelection(objContainingValue);
      }
      // the following condition happens if the current selection is removed from the available options
      if (value && !objContainingValue) {
        setValue(null);
      }
    }
  }, [allItems, value]);

  const stateReducer: UseComboboxProps<ComboboxItemType>["stateReducer"] = (
    state,
    actionAndChanges,
  ) => {
    const { type, changes } = actionAndChanges;
    const changeTypes = useCombobox.stateChangeTypes;
    let latestItems = filteredItems;

    if (
      type === changeTypes.ItemClick ||
      type === changeTypes.InputClick ||
      type === changeTypes.ToggleButtonClick
    ) {
      // The user clicked on the search field, or the toggle button, or an item.
      // So show all search results. To understand why, imagine the user has previously selected
      // an item called "Slider". When the user revisits this combobox, we want them
      // to be able to see all the results, not just the ones that match "Slider..."
      // We don't want them to have to backspace just to see the full results.
      if (!_.isEqual(allItems, filteredItems)) {
        latestItems = allItems;
        setFilteredItems(latestItems);
      }
    } else if (type === changeTypes.InputChange) {
      // The user is typing, so filter the search results.
      // Or the combobox field is updated by external state, so also filter results in this case.
      const inpuValue = changes.inputValue;
      if (inpuValue) {
        latestItems = allItems
          .map((group) => ({
            group: group.group,
            items: matchSorter(group.items, inpuValue, {
              keys: ["name"],
            }),
          }))
          .filter((group) => group.items.length > 0);
      } else {
        // if the inputValue is "", then show all items
        latestItems = allItems;
      }

      setFilteredItems(latestItems);
    }

    const mods = getReducerModifications(
      type,
      state,
      changes,
      latestItems,
      selectedItemCanBeNull,
      clearInputAfterSelection,
    );

    return { ...changes, ...mods };
  };

  return { filteredItems, stateReducer, selection };
}
