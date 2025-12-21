import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Item } from "components/Utils/atoms/dropdown/item";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { matchSorter } from "match-sorter";
import _ from "lodash";
import { useEffect, useMemo, useRef, useState } from "react";
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
  const [filterValue, setFilterValue] = useState("");
  const filterInputRef = useRef<HTMLInputElement | null>(null);

  function onClick(implSpecs: CreateSectionsContextMenuInfo["implSpecs"]) {
    createTopLevelSectionFromImplSpecs(
      implSpecs,
      screenToFlowPosition({ x, y }),
    );
    closeAllContextMenus();
  }

  const contextMenuItems = useCreateSectionsList();
  const normalizedFilter = filterValue.trim();
  const filteredGroups = useMemo(() => {
    if (!normalizedFilter) {
      return contextMenuItems;
    }

    return contextMenuItems
      .map((group) => ({
        ...group,
        items: matchSorter(group.items, normalizedFilter, { keys: ["name"] }),
      }))
      .filter((group) => group.items.length > 0);
  }, [contextMenuItems, normalizedFilter]);

  const topMatch = useMemo(() => {
    for (const group of filteredGroups) {
      if (group.items.length > 0) {
        return { group: group.group, item: group.items[0] };
      }
    }
    return null;
  }, [filteredGroups]);
  const highlightedKey =
    normalizedFilter && topMatch
      ? `${topMatch.group}:${topMatch.item.name}`
      : null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setFilterValue("");
    requestAnimationFrame(() => {
      filterInputRef.current?.focus();
      filterInputRef.current?.select();
    });
  }, [isOpen, x, y]);

  function onFilterChange(event: React.ChangeEvent<HTMLInputElement>) {
    setFilterValue(event.target.value);
  }

  function onFilterKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeAllContextMenus();
      return;
    }
    event.stopPropagation();
    if (event.key !== "Enter") {
      return;
    }
    if (!topMatch) {
      return;
    }
    event.preventDefault();
    onClick(topMatch.item.implSpecs);
  }

  return (
    <ContextMenuCore
      x={x}
      y={y}
      closeContextMenu={closeAllContextMenus}
      isOpen={isOpen}
    >
      <ContextMenuFilter
        inputRef={filterInputRef}
        value={filterValue}
        onChange={onFilterChange}
        onKeyDown={onFilterKeyDown}
      />
      {filteredGroups.map((x) => (
        <DropdownGroup
          key={x.group}
          name={x.group}
          items={x.items}
          onClick={onClick}
          highlightedKey={highlightedKey}
        />
      ))}
    </ContextMenuCore>
  );
}

function ContextMenuFilter({
  inputRef,
  value,
  onChange,
  onKeyDown,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <search className="nodrag sticky top-0 z-10 mb-1 flex w-full min-w-0 items-center bg-white px-2 pb-1 pt-2 dark:bg-setta-900">
      <div className="absolute left-0 grid select-none place-items-center pl-1">
        <i className="gg-sort-az !scale-75 text-setta-600 dark:text-setta-400" />
      </div>
      <input
        ref={inputRef}
        value={value}
        className="min-w-0 flex-grow cursor-auto truncate border-solid border-setta-200 bg-transparent py-1 pl-5 text-xs placeholder-setta-400 outline-0 [border-width:0_0_1px_0] focus-visible:!border-blue-300 dark:border-setta-800 dark:text-setta-200 dark:placeholder-setta-700"
        placeholder="Filter"
        tabIndex={0}
        onChange={onChange}
        onKeyDown={onKeyDown}
      />
    </search>
  );
}

function DropdownGroup({
  name,
  items = [],
  onClick,
  highlightedKey,
}: {
  name: string;
  items: Array<CreateSectionsContextMenuInfo>;
  onClick: (x: CreateSectionsContextMenuInfo["implSpecs"]) => void;
  highlightedKey: string | null;
}) {
  return (
    <DropdownMenu.Group className="[&:not(:first-child)]:mt-1.5">
      <DropdownMenu.Label className="menulabel mx-2 mb-1  min-w-[100px] border-b border-setta-100 py-1 text-xs font-bold uppercase text-setta-300 dark:border-setta-700 dark:text-setta-500">
        {name}
      </DropdownMenu.Label>
      {items.map((e) => (
        <Item
          key={e.name}
          onClick={() => onClick(e.implSpecs)}
          className={
            highlightedKey === `${name}:${e.name}`
              ? "bg-setta-100 dark:bg-setta-700"
              : ""
          }
        >
          {e.name}
        </Item>
      ))}
    </DropdownMenu.Group>
  );
}
