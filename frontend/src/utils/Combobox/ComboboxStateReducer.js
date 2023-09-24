import { useCombobox } from "downshift";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useEffect, useState } from "react";

function resetToPreviousVal(state) {
  const sname = state.selectedItem?.name;
  const newInputValue = sname ? sname : state.inputValue;
  return {
    selectedItem: state.selectedItem,
    inputValue: newInputValue,
  };
}

function getHighlightedIndex(latestItems, selectedItem) {
  if (selectedItem) {
    let idx = 0;
    for (const group of latestItems) {
      const currIdx = _.findIndex(group.items, selectedItem);
      if (currIdx !== -1) {
        return { highlightedIndex: idx + currIdx };
      }
      idx += group.items.length;
    }
  }
  return { highlightedIndex: -1 };
}

function getReducerModifications(
  type,
  state,
  changes,
  setFilteredItems,
  allItems,
  filteredItems,
  matchSorterProps
) {
  const changeTypes = useCombobox.stateChangeTypes;
  let latestItems = filteredItems;

  if (
    type === changeTypes.ItemClick ||
    type === changeTypes.ToggleButtonClick
  ) {
    if (!_.isEqual(allItems, filteredItems)) {
      latestItems = allItems;
      setFilteredItems(latestItems);
    }
  } else if (type === changeTypes.InputChange) {
    latestItems = allItems
      .map((group) => ({
        group: group.group,
        items: matchSorter(group.items, changes.inputValue, matchSorterProps),
      }))
      .filter((group) => group.items.length > 0);

    setFilteredItems(latestItems);
  }

  switch (type) {
    case changeTypes.InputChange:
    case changeTypes.ToggleButtonClick:
      return getHighlightedIndex(latestItems, changes.selectedItem);
    case changeTypes.InputKeyDownEscape:
      return resetToPreviousVal(state);
    case changeTypes.InputBlur:
      if (state.highlightedIndex === -1) {
        return resetToPreviousVal(state);
      }
      return {};
    default:
      return {};
  }
}

export function useComboboxStateReducer({ allItems, matchSorterProps }) {
  const [filteredItems, setFilteredItems] = useState(allItems);

  useEffect(() => {
    setFilteredItems(allItems);
  }, [allItems]);

  function stateReducer(state, actionAndChanges) {
    const { type, changes } = actionAndChanges;

    const mods = getReducerModifications(
      type,
      state,
      changes,
      setFilteredItems,
      allItems,
      filteredItems,
      matchSorterProps
    );

    return { ...changes, ...mods };
  }

  return { filteredItems, stateReducer };
}
