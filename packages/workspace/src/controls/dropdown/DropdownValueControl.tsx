import { memo, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { HiChevronDown, HiChevronUp } from "react-icons/hi2";
import { useItemSelectionMode } from "../../document/itemSelectionMode";
import { NO_DRAG_CLASS_NAME, NO_WHEEL_CLASS_NAME } from "../../interaction";
import { getElementTextDirection, type WorkspaceTextDirection } from "../../styles/textDirection";
import { useWorkspaceScopeClassName } from "../../styles/workspaceScope";
import type { ComboboxItem, ComboboxItemGroup, OnSelectedItemChange } from "./comboboxStateReducer";
import { useDropdownCombobox } from "./useDropdownCombobox";

// The item-controls milestone's dropdown: the reference `IdNameCombobox` at the `ParamUI`
// dropdown presentation, trimmed to host-supplied options — the recorded small pill input
// (rounded-full 12 px mono with the chevron toggle) inside the reference's `<search>` shell,
// over a body-portaled filtered list with the recorded group headers. Flat host choices take
// the reference's single "Choices" group; hosts that pass explicit groups get one recorded
// header per group. Every selection reports once through the controlled string seam; the
// pane variant, theme-override props, and the reference's config-editing surface have no
// control-slice caller and stay behind. The control disables from the host flag and,
// package-wide, while item-select mode is active — the reference's interaction-first disabled
// contract with no blanket opacity treatment.

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

// The `ParamUI` placement wrapper composed after the reference combobox's small outer frame,
// verbatim (including the reference composition's repeated flex token).
const ITEM_OUTER_DIV_CLASS_NAME =
  "flex h-[20px] relative w-full min-w-0 flex-col items-stretch overflow-visible section-value flex justify-self-start self-center [&_search]:my-auto";
// The reference `StandardSearch` shell; the `<search>` wrapper carries the no-drag boundary.
const ITEM_SEARCH_WRAPPER_CLASS_NAME = `flex min-w-0 mx-[2px] items-center relative ${NO_DRAG_CLASS_NAME} dark:text-setta-200`;
const META_OUTER_DIV_CLASS_NAME = `flex h-[20px] relative w-full min-w-0 flex-col items-stretch overflow-visible ${NO_DRAG_CLASS_NAME} section-value flex w-full justify-self-start self-center`;
const META_SEARCH_WRAPPER_CLASS_NAME = `flex min-w-0 mx-[2px] items-center relative ${NO_DRAG_CLASS_NAME} dark:text-setta-200 !mx-0`;
// The recorded pill presentation at the small size: rounded-full 12 px mono over the default
// white/setta-900 field, 12 px leading and 24 px trailing padding around the 16 px content height,
// and the recorded 2 px blue focus-visible ring. The package-only reset marker recreates main's
// global input reset without touching host-rendered inputs; its content-box geometry lets the
// one-pixel authored borders produce main's recorded 18 px outer height.
const INPUT_CLASS_NAME =
  "setta-workspace-native-reset flex-grow truncate outline-0 cursor-auto rounded-full text-xs font-mono text-setta-600 font-medium ps-3 focus-visible:border-white hover:bg-white/50 hover:dark:bg-setta-950 dark:text-setta-300 dark:focus-visible:border-setta-900 focus-visible:ring-2 border border-solid border-setta-100 dark:border-setta-700/70 placeholder:text-setta-200 dark:placeholder:text-setta-700 min-w-0 bg-white dark:bg-setta-900 pe-6 h-4 my-auto";
const RIGHT_ADORNMENT_CLASS_NAME = "absolute inset-y-0 end-0 grid select-none place-items-center";
// The reference `StandardSearchRightBtn` at the pill/small composition, verbatim (the trailing
// end-1 rides along from the reference's pill class map even though the button is static).
const TOGGLE_BUTTON_CLASS_NAME = `${NO_DRAG_CLASS_NAME} grid cursor-pointer place-items-center justify-center focus-visible:ring-2 bg-transparent text-setta-500 rounded-full p-0 h-4 w-4 hover:bg-blue-500 hover:text-white dark:text-setta-500 dark:hover:bg-blue-700 dark:hover:text-setta-100 end-1`;
// The recorded pill/small chevron size.
const TOGGLE_ICON_SIZE_PX = 10;
const GROUP_HEADER_CLASS_NAME =
  "mx-3 mb-1 truncate border-b border-solid border-setta-300/50 pt-3 text-[0.6rem] font-bold uppercase text-setta-400 first:pt-2";
const ITEM_CLASS_NAME = "mx-1 cursor-pointer truncate rounded-lg px-2 py-[.125rem] text-xs";
const ITEM_HIGHLIGHTED_CLASS_NAME = "bg-setta-300/50 dark:bg-setta-900/50";

type DropdownCombobox = ReturnType<typeof useDropdownCombobox>;

function isChoiceGroups(
  choices: Array<string> | Array<DropdownValueChoiceGroup>,
): choices is Array<DropdownValueChoiceGroup> {
  return choices.length > 0 && typeof choices[0] !== "string";
}

// The reference `DropdownInput` wraps its flat host choices in the single recorded "Choices"
// group; explicit host groups map onto the reference's grouped-header presentation directly.
function toItemGroups(
  choices: Array<string> | Array<DropdownValueChoiceGroup>,
): Array<ComboboxItemGroup> {
  if (isChoiceGroups(choices)) {
    return choices.map((group) => ({
      group: group.group,
      items: group.choices.map((choice) => ({ id: choice, name: choice })),
    }));
  }
  return [{ group: "Choices", items: choices.map((choice) => ({ id: choice, name: choice })) }];
}

export function DropdownValueControl({ ...props }: DropdownValueControlProps) {
  return <DropdownValueControlCore {...props} presentation="item-row" />;
}

// Package-internal meta presentation. It shares the combobox state and portal while restoring
// frozen main's edge-to-edge search shell and "Choose" placeholder.
export function MetaDropdownValueControl(props: DropdownValueControlProps) {
  return <DropdownValueControlCore {...props} presentation="meta-control" />;
}

function DropdownValueControlCore({
  ariaLabel,
  value,
  onValueChange,
  choices,
  // The reference's recorded default: the params path never overrides the `StandardSearch`
  // "Search" placeholder.
  placeholder,
  disabled = false,
  presentation,
}: DropdownValueControlProps & { presentation: "item-row" | "meta-control" }) {
  const isSelectingItems = useItemSelectionMode((x) => x.isSelectingItems);
  const isDisabled = disabled || isSelectingItems;
  const resolvedPlaceholder =
    placeholder ?? (presentation === "meta-control" ? "Choose" : "Search");
  return (
    <DropdownCombobox
      ariaLabel={ariaLabel}
      allItems={toItemGroups(choices)}
      // The reference maps the empty string to no selection on the way in; the control
      // projects the reference's null commits back to the empty string across the package's
      // string seam.
      value={value ? value : null}
      onSelectedItemChange={(id) => onValueChange(id ?? "")}
      placeholder={resolvedPlaceholder}
      isDisabled={isDisabled}
      presentation={presentation}
    />
  );
}

// The reference `IdNameCombobox` layer. It must stay a separate component below the seam
// mapping: downshift resyncs its controlled selection by identity, so the choice groups (and
// the selection object found in them) may only be rebuilt when the host props change — a
// single flattened component would rebuild them on every downshift dispatch and loop forever.
function DropdownCombobox({
  ariaLabel,
  allItems,
  value,
  onSelectedItemChange,
  placeholder,
  isDisabled,
  presentation,
}: {
  ariaLabel: string;
  allItems: Array<ComboboxItemGroup>;
  value: string | null;
  onSelectedItemChange: OnSelectedItemChange;
  placeholder: string;
  isDisabled: boolean;
  presentation: "item-row" | "meta-control";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const combobox = useDropdownCombobox({ allItems, value, onSelectedItemChange });
  return (
    <div
      className={
        presentation === "meta-control" ? META_OUTER_DIV_CLASS_NAME : ITEM_OUTER_DIV_CLASS_NAME
      }
    >
      <search
        aria-label={`${ariaLabel} choices`}
        className={
          presentation === "meta-control"
            ? META_SEARCH_WRAPPER_CLASS_NAME
            : ITEM_SEARCH_WRAPPER_CLASS_NAME
        }
      >
        <input
          className={INPUT_CLASS_NAME}
          placeholder={placeholder}
          {...combobox.getInputProps({
            "aria-label": ariaLabel,
            // The reference params path forwards no input id, and its explicit undefined
            // clobbers downshift's generated one; the rendered input carries no id in main.
            id: undefined,
            onKeyDown: combobox.onKeyDown,
            ref: inputRef,
            disabled: isDisabled,
          })}
          tabIndex={0}
        />
        <div className={RIGHT_ADORNMENT_CLASS_NAME}>
          <button
            className={TOGGLE_BUTTON_CLASS_NAME}
            data-setta-workspace-touch-target="compact"
            {...combobox.getToggleButtonProps({
              "aria-label": `${combobox.isOpen ? "Close" : "Open"} ${ariaLabel} choices`,
              disabled: isDisabled,
              type: "button",
            })}
          >
            {combobox.isOpen ? (
              <HiChevronUp aria-hidden="true" focusable="false" size={TOGGLE_ICON_SIZE_PX} />
            ) : (
              <HiChevronDown aria-hidden="true" focusable="false" size={TOGGLE_ICON_SIZE_PX} />
            )}
          </button>
        </div>
      </search>
      <DropdownComboboxList ariaLabel={ariaLabel} combobox={combobox} inputRef={inputRef}>
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
      // The reference positions the body-portaled list once per open: 30 px up from the
      // input's bottom edge, pushed back down 32 px by mt-8 — net 2 px below the pill.
      const yMargin = -30;
      const direction = getElementTextDirection(inputRef.current);
      setListDims({
        direction,
        inlineOffset: direction === "rtl" ? window.innerWidth - rect.right : rect.left,
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
        left: listDims.direction === "ltr" ? `${listDims.inlineOffset}px` : undefined,
        right: listDims.direction === "rtl" ? `${listDims.inlineOffset}px` : undefined,
        top: `${listDims.y}px`,
        minWidth: listDims.width,
      }}
    >
      <div className="w-full overflow-y-scroll">{children}</div>
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
  return (
    <dd className={`${ITEM_CLASS_NAME} ${bg}`} {...getItemProps({ item, index })}>
      {itemString}
    </dd>
  );
});

function DropdownComboboxItems({ combobox }: { combobox: DropdownCombobox }) {
  // The highlighted row is tracked across the flattened groups, exactly as the reference
  // threads its running item index through the grouped rendering.
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
