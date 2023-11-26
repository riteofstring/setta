import { ComboboxSearch } from "./ComboboxSearch";
import { idNameHelper } from "./useTotalCombobox";

export function IdNameCombobox({
  allItems,
  onSelectedItemChange,
  initialSelection,
  small,
  position,
  inputClasses,
  inputCallback,
}) {
  const { localOnSelectedItemChange, init, itemToString, matchSorterProps } =
    idNameHelper({
      allItems,
      onSelectedItemChange,
      initialSelection,
    });

  return (
    <ComboboxSearch
      allItems={allItems}
      initialSelection={init}
      itemToString={itemToString}
      onSelectedItemChange={localOnSelectedItemChange}
      matchSorterProps={matchSorterProps}
      small={small}
      position={position}
      comboboxInputClasses={inputClasses}
      inputCallback={inputCallback}
    />
  );
}
