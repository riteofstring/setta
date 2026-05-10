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
  small = false,
  outerDivClasses = "",
  inputOuterClasses,
  inputThemeClassName,
  rightButtonThemeClassName,
  listThemeClassName,
  groupHeaderThemeClassName,
  itemThemeClassName,
  itemHighlightedThemeClassName,
  listPortalContainerId,
  placeholder,
  bg,
  isDisabled,
  inputDivId,
  variant = "pill",
  selectedItemCanBeNull = false,
  clearInputAfterSelection = false,
  repositionListOnCanvasTransform = false,
}: {
  allItems: AllItemsType<T>;
  value: string | null;
  onSelectedItemChange: OnSelectedItemChangeFnType<T>;
  small?: boolean | undefined;
  outerDivClasses?: string | undefined;
  inputOuterClasses?: string | undefined;
  inputThemeClassName?: string | undefined;
  rightButtonThemeClassName?: string | undefined;
  listThemeClassName?: string | undefined;
  groupHeaderThemeClassName?: string | undefined;
  itemThemeClassName?: string | undefined;
  itemHighlightedThemeClassName?: string | undefined;
  listPortalContainerId?: string | undefined;
  placeholder?: string | undefined;
  bg?: string | undefined;
  isDisabled?: boolean | undefined;
  inputDivId?: string | undefined;
  variant?: "pill" | "pane" | undefined;
  selectedItemCanBeNull?: boolean | undefined;
  clearInputAfterSelection?: boolean | undefined;
  repositionListOnCanvasTransform?: boolean | undefined;
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
        portalContainerId={listPortalContainerId}
        repositionOnCanvasTransform={repositionListOnCanvasTransform}
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
