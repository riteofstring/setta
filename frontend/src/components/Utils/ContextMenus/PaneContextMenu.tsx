import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Item } from "components/Utils/atoms/dropdown/item";
import _ from "lodash";
import { closeAllContextMenus } from "state/actions/contextMenus";
import {
  CreateSectionsContextMenuInfo,
  useCreateSectionsList,
} from "state/actions/sections/createSectionsHelper";
import { useContextMenus } from "state/definitions";
import { createBaseSectionImplUnionWithDiscriminator } from "utils/generatedTypes";
import { ContextMenuCore } from "./ContextMenuCore";

export function PaneContextMenu() {
  const { isOpen, x, y } = useContextMenus((x) => x.pane, _.isEqual);

  function onClick(
    specificProps: CreateSectionsContextMenuInfo["specificProps"],
  ) {
    const section = createBaseSectionImplUnionWithDiscriminator(specificProps);
    console.log(section);
    // useProjectState.setState((state) => {
    //   addSectionAtPosition({
    //     position: screenToFlowPosition({ x, y }),
    //     state,
    //     ...specificProps,
    //   });
    // });
    // maybeIncrementProjectStateVersion(true);
    closeAllContextMenus();
  }

  const contextMenuItems = useCreateSectionsList();

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
          onClick={onClick}
        />
      ))}
    </ContextMenuCore>
  );
}

function DropdownGroup({
  name,
  items = [],
  onClick,
}: {
  name: string;
  items: Array<CreateSectionsContextMenuInfo>;
  onClick: (x: CreateSectionsContextMenuInfo["specificProps"]) => void;
}) {
  return (
    <DropdownMenu.Group className="[&:not(:first-child)]:mt-1.5">
      <DropdownMenu.Label className="menulabel mx-2 mb-1  min-w-[100px] border-b border-setta-100 py-1 text-xs font-bold uppercase text-setta-300 dark:border-setta-700 dark:text-setta-500">
        {name}
      </DropdownMenu.Label>
      {items.map((e) => (
        <Item key={e.name} onClick={() => onClick(e.specificProps)}>
          {e.name}
        </Item>
      ))}
    </DropdownMenu.Group>
  );
}
