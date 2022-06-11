import _ from "lodash";
import React from "react";

import { ComboboxSearch } from "./ComboboxSearch";

export function IdNameCombobox({
  allItems,
  onSelectedItemChange,
  initialSelection,
  textSize = "sm",
  simpleSearch,
}) {
  const init = _.find(allItems, { id: initialSelection });
  const itemToString = (x) => (x ? x.name : "");

  const localOnSelectedItemChange = (
    currSelectedItem,
    newSelectedItem,
    setSelection
  ) => {
    if (newSelectedItem) {
      const sid = newSelectedItem.id;
      if (sid !== currSelectedItem?.id) {
        setSelection(newSelectedItem);
      }
      onSelectedItemChange(sid);
    }
  };

  return (
    <ComboboxSearch
      allItems={allItems}
      initialSelection={init ? init : null}
      itemToString={itemToString}
      onSelectedItemChange={localOnSelectedItemChange}
      matchSorterProps={{ keys: ["name"] }}
      textSize={textSize}
      simpleSearch={simpleSearch}
    />
  );
}
