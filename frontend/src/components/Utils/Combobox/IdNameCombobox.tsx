import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  CanvasOwnedRestingComboboxInput,
  ComboboxInput,
  ComboboxItems,
  ComboboxList,
} from "./ComboboxParts";
import {
  AllItemsType,
  OnSelectedItemChangeFnType,
} from "./ComboboxStateReducer";
import { useIdNameCombobox } from "./useIdNameCombobox";

// TODO: add "display groups" argument
export function IdNameCombobox<T>({
  allItems,
  canvasOwnedRestingInput = false,
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
  canvasOwnedRestingInput?: boolean;
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
  const [canvasOwnedActivationMode, setCanvasOwnedActivationMode] = useState<
    "keyboard" | "pointer" | null
  >(null);
  const handleSelectedItemChange = useCallback<OnSelectedItemChangeFnType<T>>(
    (selectedValue) => {
      onSelectedItemChange(selectedValue);
      if (canvasOwnedRestingInput) {
        setCanvasOwnedActivationMode(null);
      }
    },
    [canvasOwnedRestingInput, onSelectedItemChange],
  );

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
    selection,
  } = useIdNameCombobox({
    allItems,
    onSelectedItemChange: handleSelectedItemChange,
    value,
    selectedItemCanBeNull,
    clearInputAfterSelection,
  });
  const showCanvasOwnedRestingInput =
    canvasOwnedRestingInput && canvasOwnedActivationMode === null;
  const displayText = selection ? itemToString(selection) : value;

  useLayoutEffect(() => {
    if (!canvasOwnedRestingInput || canvasOwnedActivationMode === null) {
      return;
    }

    const animationFrameId = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (canvasOwnedActivationMode === "pointer") {
        openMenu();
      }
    });

    return () => window.cancelAnimationFrame(animationFrameId);
  }, [canvasOwnedActivationMode, canvasOwnedRestingInput, openMenu]);

  const activateCanvasOwnedPointerInput = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (isDisabled || event.button !== 0) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setCanvasOwnedActivationMode("pointer");
    },
    [isDisabled],
  );

  const activateCanvasOwnedKeyboardInput = useCallback(() => {
    if (isDisabled) {
      return;
    }
    setCanvasOwnedActivationMode((currentMode) => currentMode ?? "keyboard");
  }, [isDisabled]);

  const handleCanvasOwnedBlur = useCallback(() => {
    if (!canvasOwnedRestingInput) {
      return;
    }

    window.setTimeout(() => {
      if (!inputRef.current?.matches(":focus") && !isOpen) {
        setCanvasOwnedActivationMode(null);
      }
    }, 0);
  }, [canvasOwnedRestingInput, isOpen]);

  return (
    <div
      className={`flex ${
        small ? "h-[20px]" : "h-8"
      } relative w-full min-w-0 flex-col items-stretch overflow-visible ${outerDivClasses}`}
    >
      {showCanvasOwnedRestingInput ? (
        <CanvasOwnedRestingComboboxInput
          bg={bg}
          displayText={displayText}
          divId={inputDivId}
          inputOuterClasses={inputOuterClasses}
          inputThemeClassName={inputThemeClassName}
          isDisabled={isDisabled}
          onFocus={activateCanvasOwnedKeyboardInput}
          onMouseDownCapture={activateCanvasOwnedPointerInput}
          placeholder={placeholder}
          rightButtonThemeClassName={rightButtonThemeClassName}
          small={small}
          variant={variant}
        />
      ) : (
        <ComboboxInput
          divId={inputDivId}
          getInputProps={getInputProps}
          getToggleButtonProps={getToggleButtonProps}
          isOpen={isOpen}
          small={small}
          onBlur={handleCanvasOwnedBlur}
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
      )}

      <ComboboxList
        isOpen={!showCanvasOwnedRestingInput && isOpen}
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
