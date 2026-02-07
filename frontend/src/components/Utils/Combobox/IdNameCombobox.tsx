import { useRef } from "react";
import { ComboboxInput, ComboboxItems, ComboboxList } from "./ComboboxParts";
import {
  AllItemsType,
  OnSelectedItemChangeFnType,
} from "./ComboboxStateReducer";
import { useIdNameCombobox } from "./useIdNameCombobox";

// TODO: add "display groups" argument
export function IdNameCombobox<T>({
  allItems,
  value,
  onSelectedItemChange,
  small,
  outerDivClasses = "",
  inputOuterClasses,
  inputThemeClassName,
  rightButtonThemeClassName,
  listThemeClassName,
  groupHeaderThemeClassName,
  itemThemeClassName,
  itemHighlightedThemeClassName,
  placeholder,
  bg,
  isDisabled,
  inputDivId,
  variant = "pill",
  selectedItemCanBeNull = false,
  clearInputAfterSelection = false,
}: {
  allItems: AllItemsType<T>;
  value: string | null;
  onSelectedItemChange: OnSelectedItemChangeFnType<T>;
  small?: boolean;
  outerDivClasses?: string;
  inputOuterClasses?: string;
  inputThemeClassName?: string;
  rightButtonThemeClassName?: string;
  listThemeClassName?: string;
  groupHeaderThemeClassName?: string;
  itemThemeClassName?: string;
  itemHighlightedThemeClassName?: string;
  placeholder?: string;
  bg?: string;
  isDisabled?: boolean;
  inputDivId?: string;
  variant?: "pill" | "pane";
  selectedItemCanBeNull?: boolean;
  clearInputAfterSelection?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    isOpen,
    filteredItems,
    getToggleButtonProps,
    getMenuProps,
    getInputProps,
    highlightedIndex,
    getItemProps,
    itemToString,
    onKeyDown,
  } = useIdNameCombobox({
    allItems,
    onSelectedItemChange,
    value,
    selectedItemCanBeNull,
    clearInputAfterSelection,
  });

  return (
    <div
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
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        bg={bg}
        isDisabled={isDisabled}
        inputRef={inputRef}
        inputOuterClasses={inputOuterClasses}
        inputThemeClassName={inputThemeClassName}
        rightButtonThemeClassName={rightButtonThemeClassName}
        variant={variant}
      />

      <ComboboxList
        isOpen={isOpen}
        getMenuProps={getMenuProps}
        inputRef={inputRef}
        listThemeClassName={listThemeClassName}
      >
        <ComboboxItems
          filteredItems={filteredItems}
          getItemProps={getItemProps}
          highlightedIndex={highlightedIndex}
          itemToString={itemToString}
          groupHeaderThemeClassName={groupHeaderThemeClassName}
          itemThemeClassName={itemThemeClassName}
          itemHighlightedThemeClassName={itemHighlightedThemeClassName}
        />
      </ComboboxList>
    </div>
  );
}
