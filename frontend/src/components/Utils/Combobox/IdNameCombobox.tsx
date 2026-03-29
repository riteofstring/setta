import { useLayoutEffect, useRef } from "react";
import { ComboboxInput, ComboboxItems, ComboboxList } from "./ComboboxParts";
import {
  buildIdNameComboboxView,
  IdNameComboboxProps,
} from "./idNameComboboxView";
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
  shouldAutoOpenOnMount = false,
}: IdNameComboboxProps<T>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasAutoOpenedRef = useRef(false);
  const view = buildIdNameComboboxView({
    allItems,
    clearInputAfterSelection,
    onSelectedItemChange,
    outerDivClasses,
    selectedItemCanBeNull,
    small,
    value,
  });

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
    openMenu,
  } = useIdNameCombobox(view.hookOptions);

  useLayoutEffect(() => {
    if (
      !shouldAutoOpenOnMount ||
      hasAutoOpenedRef.current ||
      isDisabled === true
    ) {
      return;
    }
    hasAutoOpenedRef.current = true;
    inputRef.current?.focus();
    openMenu();
  }, [isDisabled, openMenu, shouldAutoOpenOnMount]);

  return (
    <div className={view.rootClassName}>
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
