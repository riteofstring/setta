import {
  AllItemsType,
  OnSelectedItemChangeFnType,
} from "./ComboboxStateReducer";

export type IdNameComboboxVariant = "pill" | "pane";

export type IdNameComboboxProps<T> = {
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
  variant?: IdNameComboboxVariant;
  selectedItemCanBeNull?: boolean;
  clearInputAfterSelection?: boolean;
};

type BuildIdNameComboboxViewArgs<T> = Pick<
  IdNameComboboxProps<T>,
  | "allItems"
  | "clearInputAfterSelection"
  | "onSelectedItemChange"
  | "outerDivClasses"
  | "selectedItemCanBeNull"
  | "small"
  | "value"
>;

export function getIdNameComboboxRootClassName({
  outerDivClasses = "",
  small = false,
}: Pick<BuildIdNameComboboxViewArgs<never>, "outerDivClasses" | "small">) {
  return [
    "flex",
    small ? "h-[20px]" : "h-8",
    "relative w-full min-w-0 flex-col items-stretch overflow-visible",
    outerDivClasses,
  ]
    .filter(Boolean)
    .join(" ");
}

export function buildIdNameComboboxView<T>({
  allItems,
  clearInputAfterSelection = false,
  onSelectedItemChange,
  outerDivClasses = "",
  selectedItemCanBeNull = false,
  small = false,
  value,
}: BuildIdNameComboboxViewArgs<T>) {
  return {
    hookOptions: {
      allItems,
      clearInputAfterSelection,
      onSelectedItemChange,
      selectedItemCanBeNull,
      value,
    },
    rootClassName: getIdNameComboboxRootClassName({
      outerDivClasses,
      small,
    }),
  };
}
