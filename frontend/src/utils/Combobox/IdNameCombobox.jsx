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
  position,
  inputClasses,
  inputCallback,
}) {
  const init = _.find(flattenedItems(allItems), { id: initialSelection });
  const itemToString = (x) => (x ? x.name : "");

  const localOnSelectedItemChange = (
    currSelectedItem,
    newSelectedItem,
    setSelection,
    changedByUser
  ) => {
    const sid = newSelectedItem ? newSelectedItem.id : null;
    const currId = currSelectedItem ? currSelectedItem.id : null;
    if (sid !== currId) {
      setSelection(newSelectedItem);
    }
    if (sid !== initialSelection) {
      onSelectedItemChange(sid, changedByUser);
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
      position={position}
      comboboxInputClasses={inputClasses}
      inputCallback={inputCallback}
    />
  );
}
