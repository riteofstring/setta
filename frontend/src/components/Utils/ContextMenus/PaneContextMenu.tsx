import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Item } from "components/Utils/atoms/dropdown/item";
import {
  AllItemsType,
  OnSelectedItemChangeFnType,
} from "components/Utils/Combobox/ComboboxStateReducer";
import { useIdNameCombobox } from "components/Utils/Combobox/useIdNameCombobox";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import type { ComponentPropsWithRef, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef } from "react";
import { closeAllContextMenus } from "state/actions/contextMenus";
import {
  CreateSectionsContextMenuInfo,
  createTopLevelSectionFromImplSpecs,
  useCreateSectionsList,
} from "state/actions/sections/createSectionsHelper";
import { useContextMenus } from "state/definitions";
import { ContextMenuCore } from "./ContextMenuCore";

export function PaneContextMenu() {
  const { isOpen, x, y } = useContextMenus((x) => x.pane, _.isEqual);
  const contextMenuItems = useCreateSectionsList();

  function handleCreateSection(menuItem: CreateSectionsContextMenuInfo) {
    createTopLevelSectionFromImplSpecs(
      menuItem,
      screenToFlowPosition({ x, y }),
    );
    closeAllContextMenus();
  }

  return (
    <ContextMenuCore
      x={x}
      y={y}
      closeContextMenu={closeAllContextMenus}
      isOpen={isOpen}
    >
      {isOpen ? (
        <PaneContextMenuContents
          contextMenuItems={contextMenuItems}
          onClose={closeAllContextMenus}
          onCreateSection={handleCreateSection}
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
  onClose: () => void;
  onCreateSection: (menuItem: CreateSectionsContextMenuInfo) => void;
};

function PaneContextMenuContents({
  contextMenuItems,
  onClose,
  onCreateSection,
}: PaneContextMenuContentsProps) {
  const filterInputRef = useRef<HTMLInputElement | null>(null);

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

  function onFilterKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    event.stopPropagation();
  }

  const inputProps = getInputProps({
    ref: filterInputRef,
    onKeyDown: onFilterKeyDown,
  });

  let itemIndex = 0;

  return (
    <>
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
    </>
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
