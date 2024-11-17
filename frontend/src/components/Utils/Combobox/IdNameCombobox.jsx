import { useState } from "react";
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
  placeholder,
  bg,
}) {
  const itemToString = (x) => (x ? x.name : "");

  const { localOnSelectedItemChange, init, matchSorterProps } = idNameHelper({
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
  });

  const [listDims, setListDims] = useState({ x: 0, y: 0, width: 0 });

  function onInputClick(inputRef) {
    const rect = inputRef.getBoundingClientRect();
    const yMargin = -30;
    setListDims({ x: rect.left, y: rect.bottom + yMargin, width: rect.width });
  }

  return (
    <search
      className={`flex ${
        small ? "h-[20px]" : "h-8"
      } relative w-full min-w-0 flex-col items-stretch overflow-visible ${outerDivClasses}`}
    >
      <ComboboxInput
        getInputProps={getInputProps}
        getToggleButtonProps={getToggleButtonProps}
        isOpen={isReallyOpen}
        small={small}
        onInputClick={onInputClick}
        placeholder={placeholder}
        bg={bg}
      />

      <ComboboxList
        isOpen={isReallyOpen}
        getMenuProps={getMenuProps}
        position={position}
        listDims={listDims}
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
