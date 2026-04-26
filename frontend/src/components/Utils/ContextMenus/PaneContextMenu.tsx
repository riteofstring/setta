import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Item } from "components/Utils/atoms/dropdown/item";
import {
  AllItemsType,
  OnSelectedItemChangeFnType,
} from "components/Utils/Combobox/ComboboxStateReducer";
import { useIdNameCombobox } from "components/Utils/Combobox/useIdNameCombobox";
import { screenToFlowPosition } from "gpuFlow/viewportActions";
import _ from "lodash";
import type {
  ComponentPropsWithRef,
  KeyboardEvent,
  MutableRefObject,
} from "react";
import { useEffect, useMemo, useRef } from "react";
import { closeAllContextMenus } from "state/actions/contextMenus";
import {
  CreateSectionsContextMenuInfo,
  createTopLevelSectionFromImplSpecs,
  useCreateSectionsList,
} from "state/actions/sections/createSectionsHelper";
import { useContextMenus } from "state/definitions";
import { ContextMenuCore } from "./ContextMenuCore";
import {
  getFilterEditingKey,
  getFilterInputState,
  getNextFilterInputState,
  isMenuNavigationKey,
  shouldDispatchFilterInputEvent,
  shouldEditableTargetHandleMenuKey,
} from "./paneContextMenuKeyboard";

export function PaneContextMenu() {
  const { isOpen, x, y } = useContextMenus((x) => x.pane, _.isEqual);
  const contextMenuItems = useCreateSectionsList();
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  const didNavigateListRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      didNavigateListRef.current = false;
    }
  }, [isOpen]);

  function handleCreateSection(menuItem: CreateSectionsContextMenuInfo) {
    createTopLevelSectionFromImplSpecs(
      menuItem,
      screenToFlowPosition({ x, y }),
    );
    closeAllContextMenus();
  }

  function isEditableTarget(target: EventTarget | null) {
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    );
  }

  function applyKeyToFilterInput(key: string, resetInput = false) {
    const input = filterInputRef.current;
    if (!input) {
      return;
    }
    const nextState = getNextFilterInputState(
      getFilterInputState(input, resetInput),
      key,
    );
    input.focus({ preventScroll: true });
    input.value = nextState.nextValue;
    input.setSelectionRange(nextState.nextSelection, nextState.nextSelection);
    if (shouldDispatchFilterInputEvent(resetInput, nextState)) {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function onMenuKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
    if (
      shouldEditableTargetHandleMenuKey(
        isEditableTarget(event.target),
        didNavigateListRef.current,
      )
    ) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const editingKey = getFilterEditingKey(event.key);
    if (!editingKey) {
      if (isMenuNavigationKey(event.key)) {
        didNavigateListRef.current = true;
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    applyKeyToFilterInput(editingKey, didNavigateListRef.current);
    didNavigateListRef.current = false;
  }

  function onFilterKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeAllContextMenus();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      didNavigateListRef.current = true;
      event.stopPropagation();
      return;
    }
    const editingKey = getFilterEditingKey(event.key);
    if (editingKey && didNavigateListRef.current) {
      event.preventDefault();
      event.stopPropagation();
      applyKeyToFilterInput(editingKey, true);
      didNavigateListRef.current = false;
      return;
    }
    if (editingKey) {
      didNavigateListRef.current = false;
    }
    event.stopPropagation();
  }

  return (
    <ContextMenuCore
      x={x}
      y={y}
      closeContextMenu={closeAllContextMenus}
      isOpen={isOpen}
      onKeyDownCapture={onMenuKeyDownCapture}
    >
      {isOpen ? (
        <PaneContextMenuContents
          contextMenuItems={contextMenuItems}
          onCreateSection={handleCreateSection}
          filterInputRef={filterInputRef}
          onFilterKeyDown={onFilterKeyDown}
        />
      ) : null}
    </ContextMenuCore>
  );
}

type CreateSectionsContextMenuGroup = {
  group: string;
  items: Array<CreateSectionsContextMenuInfo>;
};

type PaneContextMenuContentsProps = {
  contextMenuItems: Array<CreateSectionsContextMenuGroup>;
  onCreateSection: (menuItem: CreateSectionsContextMenuInfo) => void;
  filterInputRef: MutableRefObject<HTMLInputElement | null>;
  onFilterKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
};

function PaneContextMenuContents({
  contextMenuItems,
  onCreateSection,
  filterInputRef,
  onFilterKeyDown,
}: PaneContextMenuContentsProps) {
  const allItems = useMemo<AllItemsType<CreateSectionsContextMenuInfo>>(() => {
    return contextMenuItems.map((group) => ({
      group: group.group,
      items: group.items.map((item) => ({
        id: item,
        name: item.name,
      })),
    }));
  }, [contextMenuItems]);

  const onSelectedItemChange: OnSelectedItemChangeFnType<
    CreateSectionsContextMenuInfo
  > = (item) => {
    if (!item) {
      return;
    }
    onCreateSection(item);
  };

  const {
    filteredItems,
    getInputProps,
    getMenuProps,
    highlightedIndex,
    getItemProps,
    itemToString,
  } = useIdNameCombobox({
    allItems,
    onSelectedItemChange,
    clearInputAfterSelection: true,
  });

  useEffect(() => {
    requestAnimationFrame(() => {
      filterInputRef.current?.focus();
      filterInputRef.current?.select();
    });
  }, []);

  const inputProps = getInputProps({
    ref: filterInputRef,
    onKeyDown: onFilterKeyDown,
  });

  let itemIndex = 0;

  return (
    <div>
      <ContextMenuFilter inputProps={inputProps} />
      <div {...getMenuProps()}>
        {filteredItems.map((group) => {
          const groupItems = group.items.map((item) => {
            const index = itemIndex;
            itemIndex += 1;
            const itemProps = getItemProps({ item, index });
            let highlightClassName = "";
            if (highlightedIndex === index) {
              highlightClassName = "bg-setta-100 dark:bg-setta-700";
            }
            return (
              <Item
                key={`${group.group}:${item.name}`}
                {...itemProps}
                className={highlightClassName}
              >
                {itemToString(item)}
              </Item>
            );
          });

          return (
            <DropdownMenu.Group
              key={group.group}
              className="[&:not(:first-child)]:mt-1.5"
            >
              <DropdownMenu.Label className="menulabel mx-2 mb-1  min-w-[100px] border-b border-setta-100 py-1 text-xs font-bold uppercase text-setta-300 dark:border-setta-700 dark:text-setta-500">
                {group.group}
              </DropdownMenu.Label>
              {groupItems}
            </DropdownMenu.Group>
          );
        })}
      </div>
    </div>
  );
}

function ContextMenuFilter({
  inputProps,
}: {
  inputProps: ComponentPropsWithRef<"input">;
}) {
  const { className, ...rest } = inputProps;
  const combinedClassName =
    "min-w-0 flex-grow cursor-auto truncate border-solid border-setta-200 bg-transparent py-1 pl-5 text-xs placeholder-setta-400 outline-0 [border-width:0_0_1px_0] focus-visible:!border-blue-300 dark:border-setta-800 dark:text-setta-200 dark:placeholder-setta-700";
  const classes = [combinedClassName, className].filter(Boolean).join(" ");
  return (
    <search className="nodrag sticky top-0 z-10 mb-1 flex w-full min-w-0 items-center bg-white px-2 pb-1 pt-2 dark:bg-setta-900">
      <div className="absolute left-0 grid select-none place-items-center pl-1">
        <i className="gg-sort-az !scale-75 text-setta-600 dark:text-setta-400" />
      </div>
      <input {...rest} className={classes} placeholder="Filter" tabIndex={0} />
    </search>
  );
}
