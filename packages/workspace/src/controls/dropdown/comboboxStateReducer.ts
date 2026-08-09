import {
  useCombobox,
  type UseComboboxProps,
  type UseComboboxState,
  type UseComboboxStateChangeTypes,
} from "downshift";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useLayoutEffect, useRef, useState, type DependencyList, type EffectCallback } from "react";

// The reference's `ComboboxStateReducer` trimmed to the `ParamUI` dropdown path (no
// null-selection Enter commit, no clear-input-after-selection): every downshift action is
// corrected so the frozen combobox behavior holds — typing filters the choice groups through
// match-sorter, reopening shows the full list again, Escape and blur reset the draft text to
// the committed selection, and Enter with no highlighted row commits the first filtered match.

export type ComboboxItem = { id: string; name: string };

export type ComboboxItemGroup = { group: string; items: Array<ComboboxItem> };

export type OnSelectedItemChange = (id: string | null) => void;

export const flattenedItems = (groups: Array<ComboboxItemGroup>): Array<ComboboxItem> =>
  groups.reduce<Array<ComboboxItem>>((prev, curr) => [...prev, ...curr.items], []);

function resetToPreviousVal(state: UseComboboxState<ComboboxItem>) {
  return {
    selectedItem: state.selectedItem,
    inputValue: state.selectedItem === null ? "" : state.selectedItem.name,
  };
}

function getHighlightedIndex(
  items: Array<ComboboxItemGroup>,
  selectedItem: UseComboboxState<ComboboxItem>["selectedItem"] | undefined,
) {
  if (selectedItem === undefined) {
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

function getValueFromHighlightedIndex(
  latestItems: Array<ComboboxItemGroup>,
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
  latestItems: Array<ComboboxItemGroup>,
  value: string | null,
): ComboboxItem | null {
  return _.find(flattenedItems(latestItems), (item) => item.id === value) ?? null;
}

function getFirstMatch(latestItems: Array<ComboboxItemGroup>) {
  return flattenedItems(latestItems)[0];
}

function handleEnter(state: UseComboboxState<ComboboxItem>, items: Array<ComboboxItemGroup>) {
  if (state.highlightedIndex !== -1) {
    return {};
  }
  // only do the following if no item is highlighted
  if (state.inputValue) {
    const objContainingValue = getFirstMatch(items);
    if (objContainingValue) {
      return {
        selectedItem: objContainingValue,
        inputValue: objContainingValue.name,
      };
    }
  }
  return resetToPreviousVal(state);
}

function getReducerModifications(
  type: UseComboboxStateChangeTypes,
  state: UseComboboxState<ComboboxItem>,
  changes: Partial<UseComboboxState<ComboboxItem>>,
  items: Array<ComboboxItemGroup>,
): Partial<UseComboboxState<ComboboxItem>> {
  const changeTypes = useCombobox.stateChangeTypes;

  switch (type) {
    case changeTypes.InputChange:
    case changeTypes.ToggleButtonClick:
      return getHighlightedIndex(items, changes.selectedItem);
    case changeTypes.InputKeyDownEscape:
    case changeTypes.InputBlur:
      return resetToPreviousVal(state);
    case changeTypes.InputKeyDownArrowUp:
    case changeTypes.InputKeyDownArrowDown:
      return getValueFromHighlightedIndex(items, changes.highlightedIndex);
    case changeTypes.InputKeyDownEnter:
      return handleEnter(state, items);
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
 * reports a difference. Unlike the reference, the effect runs through a
 * render-updated ref behind an inline closure: this package lints
 * `react-hooks/exhaustive-deps` at error, and React invokes the latest render's
 * effect closure either way, so the behavior is identical.
 */
function useDeepCompareLayoutEffect(effect: EffectCallback, dependencies: DependencyList) {
  const effectRef = useRef(effect);
  effectRef.current = effect;
  const dependenciesRef = useRef<DependencyList>([]);
  const signalRef = useRef(0);

  if (!_.isEqual(dependenciesRef.current, dependencies)) {
    dependenciesRef.current = dependencies;
    signalRef.current += 1;
  }
  const signal = signalRef.current;

  useLayoutEffect(() => effectRef.current(), [signal]);
}

export function useComboboxStateReducerWithFilteredItems(
  allItems: Array<ComboboxItemGroup>,
  value: string | null,
  setValue: OnSelectedItemChange,
) {
  const [filteredItems, setFilteredItems] = useState(allItems);
  // Derive the controlled selection from the latest incoming value so Downshift never lags behind during render.
  const selection = getExactMatch(allItems, value);

  useDeepCompareLayoutEffect(() => {
    setFilteredItems(allItems);
    // Keep external value honest if the matching option disappears.
    // the following condition happens if the current selection is removed from the available options
    if (value && !selection) {
      setValue(null);
    }
  }, [allItems, selection, value]);

  const stateReducer: UseComboboxProps<ComboboxItem>["stateReducer"] = (
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
      const inputValue = changes.inputValue;
      if (inputValue) {
        latestItems = allItems
          .map((group) => ({
            group: group.group,
            items: matchSorter(group.items, inputValue, {
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

    const mods = getReducerModifications(type, state, changes, latestItems);

    return { ...changes, ...mods };
  };

  return { filteredItems, stateReducer, selection };
}
