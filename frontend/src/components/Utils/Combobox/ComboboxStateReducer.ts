import {
  useCombobox,
  UseComboboxProps,
  UseComboboxState,
  UseComboboxStateChangeTypes,
} from "downshift";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import {
  useLayoutEffect,
  useRef,
  useState,
  type DependencyList,
  type EffectCallback,
} from "react";
import { flattenedItems } from "./utils";

export type ComboboxItemType<T> = { id: T; name: string };

export type ComboboxItemArrayType<T> = Array<ComboboxItemType<T>>;

export type AllItemsType<T> = Array<{
  group: string;
  items: ComboboxItemArrayType<T>;
}>;

export type OnSelectedItemChangeFnType<T> = (id: T | null) => void;

function resetToPreviousVal<T>(state: UseComboboxState<ComboboxItemType<T>>) {
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

function getHighlightedIndex<T>(
  items: AllItemsType<T>,
  selectedItem:
    | UseComboboxState<ComboboxItemType<T>>["selectedItem"]
    | undefined,
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
      const currIdx = _.findIndex(group.items, (item) => item === selectedItem);
      if (currIdx !== -1) {
        return { highlightedIndex: idx + currIdx };
      }
      idx += group.items.length;
    }
  }
  return { highlightedIndex: -1 };
}

function getValueFromHighlightedIndex<T>(
  latestItems: AllItemsType<T>,
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

function getExactMatch<T>(
  latestItems: AllItemsType<T>,
  value: string | null,
  key: string,
) {
  return _.find(flattenedItems(latestItems), { [key]: value }) ?? null;
}

function getFirstMatch<T>(latestItems: AllItemsType<T>) {
  return flattenedItems(latestItems)[0];
}

function maybeClearInput(clearInputAfterSelection: boolean) {
  if (clearInputAfterSelection) {
    return { inputValue: "" };
  }
  return {};
}

function handleEnter<T>(
  highlightedIndex: number,
  clearInputAfterSelection: boolean,
  inputValue: string,
  items: AllItemsType<T>,
  selectedItemCanBeNull: boolean,
  state: UseComboboxState<ComboboxItemType<T>>,
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

function getReducerModifications<T>(
  type: UseComboboxStateChangeTypes,
  state: UseComboboxState<ComboboxItemType<T>>,
  changes: Partial<UseComboboxState<ComboboxItemType<T>>>,
  items: AllItemsType<T>,
  selectedItemCanBeNull: boolean,
  clearInputAfterSelection: boolean,
): Partial<UseComboboxState<ComboboxItemType<T>>> {
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

/**
 * Custom hook equivalent to `useDeepCompareEffect` but using `useLayoutEffect`.
 * Downshift needs the filtered items and selection to be synchronized before the
 * browser paints; if we waited for the normal `useEffect` tick the menu would
 * briefly render stale options, then snap to the updated ones on the next frame.
 * We memoize the last dependency array via deep equality, bump a ref-backed
 * signal when the dependencies actually change, and feed that signal into
 * `useLayoutEffect` so React re-runs the effect only when the deep comparison
 * reports a difference.
 */
function useDeepCompareLayoutEffect(
  effect: EffectCallback,
  dependencies: DependencyList,
) {
  const dependenciesRef = useRef<DependencyList>([]);
  const signalRef = useRef(0);

  if (!_.isEqual(dependenciesRef.current, dependencies)) {
    dependenciesRef.current = dependencies;
    signalRef.current += 1;
  }

  useLayoutEffect(effect, [signalRef.current]);
}

export function useComboboxStateReducerWithFilteredItems<T>(
  allItems: AllItemsType<T>,
  value: string | null | undefined,
  setValue: OnSelectedItemChangeFnType<T>,
  selectedItemCanBeNull: boolean,
  clearInputAfterSelection: boolean,
) {
  const [filteredItems, setFilteredItems] = useState(allItems);
  // Derive the controlled selection from the latest incoming value so Downshift never lags behind during render.
  const selection =
    value !== undefined ? getExactMatch(allItems, value, "id") : null;

  useDeepCompareLayoutEffect(() => {
    setFilteredItems(allItems);
    if (value !== undefined) {
      // Keep external value honest if the matching option disappears.
      // the following condition happens if the current selection is removed from the available options
      if (value && !selection) {
        setValue(null);
      }
    }
  }, [allItems, selection, value]);

  const stateReducer: UseComboboxProps<ComboboxItemType<T>>["stateReducer"] = (
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
