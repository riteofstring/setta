import { useState } from "react";
import { ComboboxInput, ComboboxItems, ComboboxList } from "./ComboboxParts";
import { idNameHelper, useIdNameCombobox } from "./useIdNameCombobox";

export function IdNameCombobox({
  items,
  initialSelection,
  onSelectedItemChange,
  small,
  position,
  outerDivClasses = "",
  inputCallback,
  onInputMouseDown,
  placeholder,
  bg,
}) {
  const {
    localOnSelectedItemChange,
    init,
    itemToString,
    matchSorterProps,
    onArrowUpOrDown,
  } = idNameHelper({
    items,
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
    items,
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
    const yMargin = -30;
    setListDims({ x: rect.left, y: rect.bottom + yMargin, width: rect.width });
  }

  return (
    <search
      className={`flex ${
        small ? "h-7" : "h-8"
      } w-full min-w-0 flex-col items-stretch overflow-visible ${outerDivClasses}`}
    >
      <ComboboxInput
        getInputProps={getInputProps}
        getToggleButtonProps={getToggleButtonProps}
        isOpen={isReallyOpen}
        small={small}
        onInputMouseDown={onInputMouseDown}
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
