import { MenuList, MenuItem } from "@chakra-ui/react";
import { useGetSectionType } from "hooks/useSectionType";
import { useUndeck } from "hooks/useUndeck";
import { DECK } from "utils/constants";

import { ContextMenuCore } from "./ContextMenuCore";

export function NodeContextMenu(props) {
  const { nodeId, closeContextMenu } = props;
  const nodeIsDeck = useGetSectionType(nodeId).type === DECK;
  const undeck = useUndeck();

  function onClick() {
    undeck(nodeId);
    closeContextMenu();
  }

  return nodeIsDeck ? (
    <ContextMenuCore {...props}>
      <MenuList zIndex={10}>
        <MenuItem onClick={onClick}>Undeck</MenuItem>
      </MenuList>
    </ContextMenuCore>
  ) : null;
}
