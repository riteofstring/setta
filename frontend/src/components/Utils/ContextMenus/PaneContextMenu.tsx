import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Item } from "components/Utils/atoms/dropdown/item";
import _ from "lodash";
import { closeAllContextMenus } from "state/actions/contextMenus";
import { addNodes } from "state/actions/nodeInternals";
import {
  CreateSectionsContextMenuInfo,
  useCreateSectionsList,
} from "state/actions/sections/createSectionsHelper";
import { useContextMenus, useProjectState } from "state/definitions";
import {
  createBaseSectionImplUnionWithDiscriminator,
  createSectionCore,
  createSectionImplLayering,
  createTopLevelSectionLayout,
} from "utils/generatedTypes";
import { ContextMenuCore } from "./ContextMenuCore";

export function PaneContextMenu() {
  const { isOpen, x, y } = useContextMenus((x) => x.pane, _.isEqual);

  function onClick(
    specificProps: CreateSectionsContextMenuInfo["specificProps"],
  ) {
    const sectionImpl = createBaseSectionImplUnionWithDiscriminator({
      ...specificProps,
    });
    const sectionImplLayering = createSectionImplLayering({
      impl: sectionImpl.id,
    });
    const section = createSectionCore({
      implLayerings: [sectionImplLayering.id],
      defaultImplLayering: sectionImplLayering.id,
    });
    const topLevelSectionLayout = createTopLevelSectionLayout({ x, y });

    useProjectState.setState((state) => {
      state.projectConfig.sectionImplLayeringMap[section.id] =
        sectionImplLayering.id;
      state.projectConfig.topLevelSections[section.id] = topLevelSectionLayout;
      state.sections[section.id] = section;
      state.sectionImpls[sectionImpl.id] = sectionImpl;
      state.sectionImplLayerings[sectionImplLayering.id] = sectionImplLayering;
    });
    addNodes([
      {
        id: section.id,
        position: { x, y },
        zIndex: 0,
        tempZIndex: 0,
        visibility: true,
      },
    ]);
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
