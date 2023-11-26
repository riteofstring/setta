import { useCombobox } from "downshift";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";

function resetToPreviousVal(state) {
  const sname = state.selectedItem?.name;
  const newInputValue = sname ? sname : state.inputValue;
  return {
    selectedItem: state.selectedItem,
    inputValue: newInputValue,
  };
}

function getHighlightedIndex(items, selectedItem) {
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

function getReducerModifications({
  type,
  state,
  changes,
  items,
  onArrowUpOrDown,
}) {
  const changeTypes = useCombobox.stateChangeTypes;

  switch (type) {
    case changeTypes.InputChange:
    case changeTypes.ToggleButtonClick:
      return getHighlightedIndex(items, changes.selectedItem);
    case changeTypes.InputKeyDownEscape:
      return resetToPreviousVal(state);
    case changeTypes.InputBlur:
      if (state.highlightedIndex === -1) {
        return resetToPreviousVal(state);
      }
      return {};
    case changeTypes.InputKeyDownArrowUp:
    case changeTypes.InputKeyDownArrowDown:
      return onArrowUpOrDown?.(items, changes.highlightedIndex);
    default:
      return {};
  }
}

export function useComboboxStateReducerWithFilteredItems({
  allItems,
  matchSorterProps,
  inputCallback,
  onArrowUpOrDown,
}) {
  const [filteredItems, setFilteredItems] = useState(allItems);

  useDeepCompareEffect(() => {
    setFilteredItems(allItems);
  }, [allItems]);

  function stateReducer(state, actionAndChanges) {
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
      latestItems = allItems
        .map((group) => ({
          group: group.group,
          items: matchSorter(group.items, changes.inputValue, matchSorterProps),
        }))
        .filter((group) => group.items.length > 0);

      setFilteredItems(latestItems);
      inputCallback?.(changes.inputValue);
    } else if (type === changeTypes.ControlledPropUpdatedSelectedItem) {
      // Call the callback when the input value is updated by us
      // (like when loading the project for the first time, the input field is populated with the saved selected item.)
      inputCallback?.(changes.inputValue);
    }

    const mods = getReducerModifications({
      type,
      state,
      changes,
      items: latestItems,
      onArrowUpOrDown,
    });

    return { ...changes, ...mods };
  }

  return { filteredItems, stateReducer };
}

export function useComboboxStateReducer({ allItems, onArrowUpOrDown }) {
  function stateReducer(state, actionAndChanges) {
    const { type, changes } = actionAndChanges;

    const mods = getReducerModifications({
      type,
      state,
      changes,
      items: allItems,
      onArrowUpOrDown,
    });

    return { ...changes, ...mods };
  }

  return stateReducer;
}
