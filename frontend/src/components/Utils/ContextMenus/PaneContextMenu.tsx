import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Item } from "components/Utils/atoms/dropdown/item";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import _ from "lodash";
import { closeAllContextMenus } from "state/actions/contextMenus";
import {
  createTopLevelSectionFromImplSpecs,
  useCreateSectionsList,
} from "state/actions/sections/createSectionsHelper";
import type { CreateSectionsContextMenuInfo } from "state/actions/sections/createSectionsHelper";
import { useContextMenus } from "state/definitions";
import { ContextMenuCore } from "./ContextMenuCore";

type CanvasContextMenuItem = {
  name: string;
  onClick: () => void;
};

export function PaneContextMenu() {
  const { isOpen, x, y } = useContextMenus((x) => x.pane, _.isEqual);
  const position = screenToFlowPosition({ x, y });

  function onClickSection(
    implSpecs: CreateSectionsContextMenuInfo["implSpecs"],
  ) {
    createTopLevelSectionFromImplSpecs(implSpecs, position);
    closeAllContextMenus();
  }

  const contextMenuItems = useCreateSectionsList().map((group) => ({
    group: group.group,
    items: group.items.map((item) => ({
      name: item.name,
      onClick: () => onClickSection(item.implSpecs),
    })),
  }));

  return (
    <ContextMenuCore
      x={x}
      y={y}
      closeContextMenu={closeAllContextMenus}
      isOpen={isOpen}
    >
      {contextMenuItems.map((x) => (
        <DropdownGroup
          key={x.group}
          name={x.group}
          items={x.items}
        />
      ))}
    </ContextMenuCore>
  );
}

function DropdownGroup({
  name,
  items = [],
}: {
  name: string;
  items: Array<CanvasContextMenuItem>;
}) {
  return (
    <DropdownMenu.Group className="[&:not(:first-child)]:mt-1.5">
      <DropdownMenu.Label className="menulabel mx-2 mb-1  min-w-[100px] border-b border-setta-100 py-1 text-xs font-bold uppercase text-setta-300 dark:border-setta-700 dark:text-setta-500">
        {name}
      </DropdownMenu.Label>
      {items.map((e) => (
        <Item key={e.name} onClick={e.onClick}>
          {e.name}
        </Item>
      ))}
    </DropdownMenu.Group>
  );
}
