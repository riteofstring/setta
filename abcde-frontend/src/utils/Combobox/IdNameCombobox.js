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
  itemStyleGetter,
}) {
  const init = _.find(allItems, { id: initialSelection });
  const itemToString = (x) => (x ? x.name : "");

  const localOnSelectedItemChange = (
    currSelectedItem,
    newSelectedItem,
    setSelection
  ) => {
    // Don't do ?. operator here because I want null, not undefined
    const sid = newSelectedItem ? newSelectedItem.id : null;
    const currId = currSelectedItem ? currSelectedItem.id : null;
    if (sid !== currId) {
      setSelection(newSelectedItem);
    }
    if (sid !== initialSelection) {
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
      size={size}
      width={width}
      itemStyleGetter={itemStyleGetter}
    />
  );
}
