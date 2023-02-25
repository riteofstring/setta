import { NULL_OBJ_ID } from "abcde-utils/src/constants";
import _ from "lodash";
import { ComboboxSearch } from "./ComboboxSearch";
import { flattenedItems } from "./utils";

export function IdNameCombobox({
  allItems,
  onSelectedItemChange,
  initialSelection,
  itemStyleGetter,
  small,
  onClick,
}) {
  const init = _.find(flattenedItems(allItems), { id: initialSelection });
  const itemToString = (x) => (x ? x.name : "");

  const localOnSelectedItemChange = (
    currSelectedItem,
    newSelectedItem,
    setSelection
  ) => {
    const sid = newSelectedItem ? newSelectedItem.id : NULL_OBJ_ID;
    const currId = currSelectedItem ? currSelectedItem.id : NULL_OBJ_ID;
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
      itemStyleGetter={itemStyleGetter}
      small={small}
      onClick={onClick}
    />
  );
}
