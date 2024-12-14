import { useState } from "react";
import { ComboboxInput, ComboboxItems, ComboboxList } from "./ComboboxParts";
import { useIdNameCombobox } from "./useIdNameCombobox";

// TODO: add "display groups" argument
export function IdNameCombobox({
  allItems,
  value,
  onSelectedItemChange,
  small,
  outerDivClasses = "",
  placeholder,
  bg,
  isDisabled,
  inputDivId,
  InputComponent = ComboboxInput,
}) {
  const itemToString = (x) => (x ? x.name : "");

  const {
    isOpen,
    filteredItems,
    getToggleButtonProps,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
  } = useIdNameCombobox({
    allItems,
    onSelectedItemChange,
    value,
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
      <InputComponent
        divId={inputDivId}
        getInputProps={getInputProps}
        getToggleButtonProps={getToggleButtonProps}
        isOpen={isOpen}
        small={small}
        onInputClick={onInputClick}
        placeholder={placeholder}
        bg={bg}
        isDisabled={isDisabled}
      />

      <ComboboxList
        isOpen={isOpen}
        getMenuProps={getMenuProps}
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
