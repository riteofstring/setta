import { ComboboxInput, ComboboxItems, ComboboxList } from "./ComboboxParts";
import { idNameHelper, useIdNameCombobox } from "./useIdNameCombobox";

// TODO: make allItems be a list of {group: string, items: list}
// TODO: add "display groups" argument
export function IdNameCombobox({
  allItems,
  initialSelection,
  onSelectedItemChange,
  small,
  position,
  outerDivClasses = "",
  inputCallback,
  onInputMouseDown,
  placeholder,
}) {
  const {
    localOnSelectedItemChange,
    init,
    itemToString,
    matchSorterProps,
    onArrowUpOrDown,
  } = idNameHelper({
    allItems,
    onSelectedItemChange,
    initialSelection,
  });

  const {
    isOpen: isReallyOpen,
    filteredItems,
    getToggleButtonProps,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
  } = useIdNameCombobox({
    allItems,
    matchSorterProps,
    onSelectedItemChange: localOnSelectedItemChange,
    initialSelection: init,
    itemToString,
    inputCallback,
    onArrowUpOrDown,
  });

  return (
    <search
      className={`card-search flex ${
        small ? "h-7" : "h-8"
      } w-full min-w-0 flex-col items-stretch overflow-visible ${outerDivClasses}`}
    >
      <ComboboxInput
        getInputProps={getInputProps}
        getToggleButtonProps={getToggleButtonProps}
        isOpen={isReallyOpen}
        small={small}
        onInputMouseDown={onInputMouseDown}
        placeholder={placeholder}
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
    </search>
  );
}
