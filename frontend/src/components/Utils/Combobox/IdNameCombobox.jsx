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
}) {
  const {
    isOpen,
    filteredItems,
    getToggleButtonProps,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
    itemToString,
    onInputClick,
    listDims,
  } = useIdNameCombobox({
    allItems,
    onSelectedItemChange,
    value,
  });

  return (
    <search
      className={`flex ${
        small ? "h-[20px]" : "h-8"
      } relative w-full min-w-0 flex-col items-stretch overflow-visible ${outerDivClasses}`}
    >
      <ComboboxInput
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
