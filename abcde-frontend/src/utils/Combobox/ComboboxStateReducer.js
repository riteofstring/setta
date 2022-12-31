import { useCombobox } from "downshift";
import _ from "lodash";
import { matchSorter } from "match-sorter";
import { useState } from "react";

function resetToPreviousVal(state) {
  const sname = state.selectedItem?.name;
  const newInputValue = sname ? sname : state.inputValue;
  return {
    selectedItem: state.selectedItem,
    inputValue: newInputValue,
  };
}

function getReducerModifications(
  type,
  state,
  changes,
  changeTypes,
  setFilteredItems,
  allItems,
  filteredItems,
  matchSorterProps
) {
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
    latestItems = matchSorter(allItems, changes.inputValue, matchSorterProps);
    setFilteredItems(latestItems);
  }

  switch (type) {
    case changeTypes.InputChange:
    case changeTypes.ToggleButtonClick:
      return {
        highlightedIndex: _.findIndex(latestItems, changes.selectedItem),
      };
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
  const [filteredItems, setFilteredItems] = useState([]);

  function stateReducer(state, actionAndChanges) {
    const { type, changes } = actionAndChanges;
    const changeTypes = useCombobox.stateChangeTypes;

    const mods = getReducerModifications(
      type,
      state,
      changes,
      changeTypes,
      setFilteredItems,
      allItems,
      filteredItems,
      matchSorterProps
    );

    return { ...changes, ...mods };
  }

  return { filteredItems, stateReducer };
}
