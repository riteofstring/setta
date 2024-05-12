import { useState } from "react";
import {
  ComboboxInputFloating,
  ComboboxItemsFloating,
  ComboboxListFloating,
} from "./ComboboxPartsFloating";
import { idNameHelper, useIdNameCombobox } from "./useIdNameCombobox";

// TODO: make allItems be a list of {group: string, items: list}
// TODO: add "display groups" argument
export function IdNameComboboxFloating({
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

  const [listDims, setListDims] = useState({ x: 0, y: 0, width: 0 });

  function onInputClick(e) {
    const rect = e.target.getBoundingClientRect();
    setListDims({ x: rect.left, y: rect.top, width: rect.width });
  }

  return (
    <search
      className={`card-search flex ${
        small ? "h-7" : "h-8"
      } w-full min-w-0 flex-col items-stretch overflow-visible ${outerDivClasses}`}
    >
      <ComboboxInputFloating
        getInputProps={getInputProps}
        getToggleButtonProps={getToggleButtonProps}
        isOpen={isReallyOpen}
        small={small}
        onInputMouseDown={onInputMouseDown}
        onInputClick={onInputClick}
        placeholder={placeholder}
      />

      <ComboboxListFloating
        isOpen={isReallyOpen}
        getMenuProps={getMenuProps}
        position={position}
        listDims={listDims}
      >
        <ComboboxItemsFloating
          filteredItems={filteredItems}
          getItemProps={getItemProps}
          highlightedIndex={highlightedIndex}
          itemToString={itemToString}
        />
      </ComboboxListFloating>
    </search>
  );
}
