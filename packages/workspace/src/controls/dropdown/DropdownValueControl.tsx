import {
  memo,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";
import { useItemSelectionModeForControl } from "../../document/itemSelectionMode.js";
import { NO_DRAG_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "../../interaction.js";
import {
  getElementTextDirection,
  type WorkspaceTextDirection,
} from "../../styles/textDirection.js";
import { useWorkspaceScopeClassName } from "../../styles/workspaceScope.js";
import type {
  ComboboxItem,
  ComboboxItemGroup,
  OnSelectedItemChange,
} from "./comboboxStateReducer.js";
import { useDropdownCombobox } from "./useDropdownCombobox.js";

export type DropdownValueChoiceGroup = {
  group: string;
  choices: Array<string>;
};

export type DropdownValueControlProps = {
  ariaLabel: string;
  value: string;
  onValueChange: (nextValue: string) => void;
  choices: Array<string> | Array<DropdownValueChoiceGroup>;
  placeholder?: string;
  disabled?: boolean;
};

const ITEM_OUTER_DIV_CLASS_NAME =
  "flex h-[20px] relative w-full min-w-0 flex-col items-stretch overflow-visible section-value flex justify-self-start self-center [&_search]:my-auto";

const ITEM_SEARCH_WRAPPER_CLASS_NAME = `flex min-w-0 mx-[2px] items-center relative ${NO_DRAG_CLASS_NAME} dark:text-setta-200`;
const META_OUTER_DIV_CLASS_NAME = `flex h-[20px] relative w-full min-w-0 flex-col items-stretch overflow-visible ${NO_DRAG_CLASS_NAME} section-value flex w-full justify-self-start self-center`;
const META_SEARCH_WRAPPER_CLASS_NAME = `flex min-w-0 mx-[2px] items-center relative ${NO_DRAG_CLASS_NAME} dark:text-setta-200 !mx-0`;
const PARAMETER_CONFIG_OUTER_DIV_CLASS_NAME =
  "relative flex h-8 w-full min-w-0 flex-col items-stretch overflow-visible";
const PARAMETER_CONFIG_SEARCH_WRAPPER_CLASS_NAME = `relative mt-0.5 flex min-w-0 items-center ${NO_DRAG_CLASS_NAME} dark:text-setta-200`;

const INPUT_CLASS_NAME =
  "setta-workspace-native-reset flex-grow truncate outline-0 cursor-auto rounded-full text-xs font-mono text-setta-600 font-medium ps-3 focus-visible:border-white hover:bg-white/50 hover:dark:bg-setta-950 dark:text-setta-300 dark:focus-visible:border-setta-900 focus-visible:ring-2 border border-solid border-setta-100 dark:border-setta-700/70 placeholder:text-setta-200 dark:placeholder:text-setta-700 min-w-0 bg-white dark:bg-setta-900 pe-6 h-4 my-auto";
const PARAMETER_CONFIG_INPUT_CLASS_NAME =
  "setta-workspace-native-reset h-7 min-w-0 flex-grow cursor-auto truncate rounded-full border border-solid border-setta-100 bg-white ps-2 pe-8 font-mono text-xs font-medium text-setta-600 outline-0 placeholder:text-setta-200 hover:bg-white/50 focus-visible:border-white focus-visible:ring-2 disabled:cursor-not-allowed dark:border-setta-700/70 dark:bg-setta-900 dark:text-setta-300 dark:placeholder:text-setta-700 dark:hover:bg-setta-950 dark:focus-visible:border-setta-900";
const RIGHT_ADORNMENT_CLASS_NAME =
  "absolute inset-y-0 end-0 grid select-none place-items-center";

const TOGGLE_BUTTON_CLASS_NAME = `${NO_DRAG_CLASS_NAME} grid cursor-pointer place-items-center justify-center focus-visible:ring-2 bg-transparent text-setta-500 rounded-full p-0 h-4 w-4 hover:bg-blue-500 hover:text-white dark:text-setta-500 dark:hover:bg-blue-700 dark:hover:text-setta-100 end-1`;
const PARAMETER_CONFIG_TOGGLE_BUTTON_CLASS_NAME = `${NO_DRAG_CLASS_NAME} grid h-7 w-7 cursor-pointer place-items-center justify-center rounded-full bg-transparent p-0 text-setta-500 hover:bg-blue-500 hover:text-white focus-visible:ring-2 disabled:cursor-not-allowed dark:text-setta-500 dark:hover:bg-blue-700 dark:hover:text-setta-100`;

const TOGGLE_ICON_SIZE_PX = 10;
const GROUP_HEADER_CLASS_NAME =
  "mx-3 mb-1 truncate border-b border-solid border-setta-300/50 pt-3 text-[0.6rem] font-bold uppercase text-setta-400 first:pt-2";
const ITEM_CLASS_NAME = "mx-1 truncate rounded-lg px-2 py-[.125rem] text-xs";
const ITEM_HIGHLIGHTED_CLASS_NAME = "bg-setta-300/50 dark:bg-setta-900/50";
const MENU_SCROLLPORT_CLASS_NAME =
  "setta-workspace-dropdown-scrollport w-full overflow-y-scroll";

type DropdownCombobox = ReturnType<typeof useDropdownCombobox>;
type DropdownPresentation = "item-row" | "meta-control" | "parameter-config";

const OUTER_CLASS_NAMES: Record<DropdownPresentation, string> = {
  "item-row": ITEM_OUTER_DIV_CLASS_NAME,
  "meta-control": META_OUTER_DIV_CLASS_NAME,
  "parameter-config": PARAMETER_CONFIG_OUTER_DIV_CLASS_NAME,
};
const SEARCH_CLASS_NAMES: Record<DropdownPresentation, string> = {
  "item-row": ITEM_SEARCH_WRAPPER_CLASS_NAME,
  "meta-control": META_SEARCH_WRAPPER_CLASS_NAME,
  "parameter-config": PARAMETER_CONFIG_SEARCH_WRAPPER_CLASS_NAME,
};
const INPUT_CLASS_NAMES: Record<DropdownPresentation, string> = {
  "item-row": INPUT_CLASS_NAME,
  "meta-control": INPUT_CLASS_NAME,
  "parameter-config": PARAMETER_CONFIG_INPUT_CLASS_NAME,
};
const TOGGLE_CLASS_NAMES: Record<DropdownPresentation, string> = {
  "item-row": TOGGLE_BUTTON_CLASS_NAME,
  "meta-control": TOGGLE_BUTTON_CLASS_NAME,
  "parameter-config": PARAMETER_CONFIG_TOGGLE_BUTTON_CLASS_NAME,
};
const TOGGLE_ICON_SIZES: Record<DropdownPresentation, number> = {
  "item-row": TOGGLE_ICON_SIZE_PX,
  "meta-control": TOGGLE_ICON_SIZE_PX,
  "parameter-config": 12,
};

type ParameterConfigurationTypeChoice = {
  id: string;
  name: string;
  disabled?: boolean;
};

export function ParameterConfigurationTypeCombobox({
  ariaLabel,
  choices,
  disabled,
  inputId,
  onValueChange,
  value,
}: {
  ariaLabel: string;
  choices: ReadonlyArray<ParameterConfigurationTypeChoice>;
  disabled: boolean;
  inputId: string;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <DropdownCombobox
      allItems={[
        {
          group: "Base",
          items: choices.map((choice) => ({ ...choice })),
        },
      ]}
      ariaLabel={ariaLabel}
      inputId={inputId}
      isDisabled={disabled}
      onSelectedItemChange={(selectedId) => {
        const selected = choices.find((choice) => choice.id === selectedId);
        if (selected === undefined || selected.disabled) {
          return;
        }
        onValueChange(selected.id);
      }}
      placeholder="Search"
      presentation="parameter-config"
      value={value}
    />
  );
}

function isChoiceGroups(
  choices: Array<string> | Array<DropdownValueChoiceGroup>,
): choices is Array<DropdownValueChoiceGroup> {
  return choices.length > 0 && typeof choices[0] !== "string";
}

function toItemGroups(
  choices: Array<string> | Array<DropdownValueChoiceGroup>,
): Array<ComboboxItemGroup> {
  if (isChoiceGroups(choices)) {
    return choices.map((group) => ({
      group: group.group,
      items: group.choices.map((choice) => ({ id: choice, name: choice })),
    }));
  }
  return [
    {
      group: "Choices",
      items: choices.map((choice) => ({ id: choice, name: choice })),
    },
  ];
}

export function DropdownValueControl({ ...props }: DropdownValueControlProps) {
  return <DropdownValueControlCore {...props} presentation="item-row" />;
}

export function MetaDropdownValueControl(props: DropdownValueControlProps) {
  return <DropdownValueControlCore {...props} presentation="meta-control" />;
}

function DropdownValueControlCore({
  ariaLabel,
  value,
  onValueChange,
  choices,

  placeholder,
  disabled = false,
  presentation,
}: DropdownValueControlProps & { presentation: "item-row" | "meta-control" }) {
  const isSelectingItems = useItemSelectionModeForControl();
  const isDisabled = disabled || isSelectingItems;
  const resolvedPlaceholder =
    placeholder ?? (presentation === "meta-control" ? "Choose" : "Search");
  return (
    <DropdownCombobox
      ariaLabel={ariaLabel}
      allItems={toItemGroups(choices)}

      value={value ? value : null}
      onSelectedItemChange={(id) => onValueChange(id ?? "")}
      placeholder={resolvedPlaceholder}
      isDisabled={isDisabled}
      presentation={presentation}
    />
  );
}

function DropdownCombobox({
  ariaLabel,
  allItems,
  inputId,
  value,
  onSelectedItemChange,
  placeholder,
  isDisabled,
  presentation,
}: {
  ariaLabel: string;
  allItems: Array<ComboboxItemGroup>;
  inputId?: string;
  value: string | null;
  onSelectedItemChange: OnSelectedItemChange;
  placeholder: string;
  isDisabled: boolean;
  presentation: DropdownPresentation;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const combobox = useDropdownCombobox({
    allItems,
    value,
    onSelectedItemChange,
  });
  const ToggleIcon = combobox.isOpen ? HiChevronUp : HiChevronDown;
  return (
    <div className={OUTER_CLASS_NAMES[presentation]}>
      <search
        aria-label={`${ariaLabel} choices`}
        className={SEARCH_CLASS_NAMES[presentation]}
      >
        <input
          className={INPUT_CLASS_NAMES[presentation]}
          placeholder={placeholder}
          {...combobox.getInputProps({
            "aria-label": ariaLabel,

            id: presentation === "parameter-config" ? inputId : undefined,
            onKeyDown: combobox.onKeyDown,
            ref: inputRef,
            disabled: isDisabled,
          })}
          tabIndex={0}
        />
        <div className={RIGHT_ADORNMENT_CLASS_NAME}>
          <button
            className={TOGGLE_CLASS_NAMES[presentation]}
            data-setta-workspace-touch-target="compact"
            {...combobox.getToggleButtonProps({
              "aria-label": `${combobox.isOpen ? "Close" : "Open"} ${ariaLabel} choices`,
              disabled: isDisabled,
              type: "button",
            })}
          >
            <ToggleIcon
              aria-hidden="true"
              focusable="false"
              size={TOGGLE_ICON_SIZES[presentation]}
            />
          </button>
        </div>
      </search>
      <DropdownComboboxList
        ariaLabel={ariaLabel}
        combobox={combobox}
        inputRef={inputRef}
      >
        <DropdownComboboxItems combobox={combobox} />
      </DropdownComboboxList>
    </div>
  );
}

function DropdownComboboxList({
  ariaLabel,
  combobox,
  inputRef,
  children,
}: {
  ariaLabel: string;
  combobox: DropdownCombobox;
  inputRef: RefObject<HTMLInputElement | null>;
  children: ReactNode;
}) {
  const [listDims, setListDims] = useState<{
    direction: WorkspaceTextDirection;
    inlineOffset: number;
    y: number;
    width: number;
  }>({ direction: "ltr", inlineOffset: 0, y: 0, width: 0 });
  const workspaceScopeClassName = useWorkspaceScopeClassName();
  const display = combobox.isOpen ? "flex" : "hidden";

  useLayoutEffect(() => {
    if (combobox.isOpen && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();

      const yMargin = -30;
      const direction = getElementTextDirection(inputRef.current);
      setListDims({
        direction,
        inlineOffset:
          direction === "rtl" ? window.innerWidth - rect.right : rect.left,
        y: rect.bottom + yMargin,
        width: rect.width,
      });
    }
  }, [combobox.isOpen, inputRef]);

  return createPortal(
    <div
      className={`${workspaceScopeClassName} ${NO_WHEEL_CLASS_NAME} ${NO_DRAG_CLASS_NAME} absolute w-fit pb-2 ${display} z-[80] mt-8 max-h-96 rounded-md border bg-white shadow-xl dark:border-setta-700/70 dark:bg-setta-800 dark:text-setta-200 dark:shadow-setta-900/50`}
      {...combobox.getMenuProps({ "aria-label": `${ariaLabel} choices` })}
      dir={listDims.direction}
      style={{
        left:
          listDims.direction === "ltr"
            ? `${listDims.inlineOffset}px`
            : undefined,
        right:
          listDims.direction === "rtl"
            ? `${listDims.inlineOffset}px`
            : undefined,
        top: `${listDims.y}px`,
        minWidth: listDims.width,
      }}
    >
      <div className={MENU_SCROLLPORT_CLASS_NAME}>{children}</div>
    </div>,
    document.body,
  );
}

const DropdownComboboxItem = memo(function DropdownComboboxItem({
  getItemProps,
  item,
  index,
  isHighlighted,
  itemString,
}: {
  getItemProps: DropdownCombobox["getItemProps"];
  item: ComboboxItem;
  index: number;
  isHighlighted: boolean;
  itemString: string;
}) {
  const bg = isHighlighted ? ITEM_HIGHLIGHTED_CLASS_NAME : "";
  const availability = item.disabled
    ? "cursor-not-allowed opacity-50"
    : "cursor-pointer";
  return (
    <dd
      className={`${ITEM_CLASS_NAME} ${bg} ${availability}`}
      {...getItemProps({ item, index })}
    >
      {itemString}
    </dd>
  );
});

function DropdownComboboxItems({ combobox }: { combobox: DropdownCombobox }) {
  let globalIndex = 0;
  return (
    <>
      {combobox.filteredItems.map((group, groupIndex) => (
        <dl key={groupIndex}>
          <dt className={GROUP_HEADER_CLASS_NAME}>{group.group}</dt>
          {group.items.map((item, itemIndex) => {
            const index = globalIndex;
            globalIndex += 1;
            return (
              <DropdownComboboxItem
                getItemProps={combobox.getItemProps}
                item={item}
                index={index}
                isHighlighted={index === combobox.highlightedIndex}
                itemString={combobox.itemToString(item)}
                key={itemIndex}
              />
            );
          })}
        </dl>
      ))}
    </>
  );
}
