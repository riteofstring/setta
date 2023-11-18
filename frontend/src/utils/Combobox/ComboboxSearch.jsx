import { ComboboxInput, ComboboxItems, ComboboxList } from "./Combobox";
import { useTotalCombobox } from "./useTotalCombobox";

// TODO: make allItems be a list of {group: string, items: list}
// TODO: add "display groups" argument
export function ComboboxSearch({
  allItems,
  initialSelection,
  itemToString,
  onSelectedItemChange,
  matchSorterProps,
  small,
  onClick,
  position,
  comboboxInputClasses,
  inputCallback,
}) {
  const {
    isOpen: isReallyOpen,
    filteredItems,
    getToggleButtonProps,
    getMenuProps,
    getInputProps,
    getComboboxProps,
    highlightedIndex,
    getItemProps,
  } = useTotalCombobox({
    allItems,
    matchSorterProps,
    onSelectedItemChange,
    initialSelection,
    itemToString,
  });

  return (
    <div
      className={`flex ${
        small ? "h-7" : "h-10"
      } w-full flex-col items-stretch overflow-visible ${comboboxInputClasses}`}
      {...getComboboxProps()}
    >
      <ComboboxInput
        getInputProps={getInputProps}
        getToggleButtonProps={getToggleButtonProps}
        isOpen={isReallyOpen}
        small={small}
        onClick={onClick}
        inputCallback={inputCallback}
      />

      <ComboboxList
        isOpen={isReallyOpen}
        getMenuProps={getMenuProps}
        position={position}
      >
        <ComboboxItems
          filteredItems={filteredItems}
          getItemProps={getItemProps}
          highlightedIndex={highlightedIndex}
          itemToString={itemToString}
        />
      </ComboboxList>
    </div>
  );
}
