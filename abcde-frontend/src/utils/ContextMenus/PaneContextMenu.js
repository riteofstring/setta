import { MenuList, MenuItem } from "@chakra-ui/react";
import { useCreateDefaultSectionInfo } from "hooks/useCreateInfo";
import { useReactFlow } from "react-flow-renderer";
import { DEFAULT_DECK_UI_TYPE_ID } from "utils/constants";

import { ContextMenuCore } from "./ContextMenuCore";

export function PaneContextMenu(props) {
  const { x, y, closeContextMenu, reactFlowRef } = props;
  const { project } = useReactFlow();
  const addSection = useCreateDefaultSectionInfo();

  function onClick(isDeck) {
    return () => {
      // see https://reactflow.dev/docs/examples/interaction/drag-and-drop/
      const reactFlowBounds = reactFlowRef.current.getBoundingClientRect();
      const initialPosition = project({
        x: x - reactFlowBounds.left,
        y: y - reactFlowBounds.top,
      });
      const sectionProps = { isTopLevel: true, initialPosition };
      if (isDeck) {
        sectionProps.uiTypeId = DEFAULT_DECK_UI_TYPE_ID;
      }
      addSection(sectionProps);
      closeContextMenu();
    };
  }

  return (
    <ContextMenuCore {...props}>
      <MenuList>
        <MenuItem onClick={onClick(false)}>New Section</MenuItem>
        <MenuItem onClick={onClick(true)}>New Deck</MenuItem>
      </MenuList>
    </ContextMenuCore>
  );
}
