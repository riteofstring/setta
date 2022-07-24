import _ from "lodash";

import { ComboboxSearch } from "./ComboboxSearch";

export function IdNameCombobox({
  allItems,
  onSelectedItemChange,
  initialSelection,
  textSize = "sm",
  simpleSearch,
  size,
  width,
}) {
  const init = _.find(allItems, { id: initialSelection });
  const itemToString = (x) => (x ? x.name : "");

  const localOnSelectedItemChange = (
    currSelectedItem,
    newSelectedItem,
    setSelection
  ) => {
    if (newSelectedItem) {
      const { id, name } = newSelectedItem;
      if (id !== currSelectedItem?.id) {
        setSelection(newSelectedItem);
      }
      onSelectedItemChange(id, name);
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
      size={size}
      width={width}
    />
  );
}
