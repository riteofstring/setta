import { MenuItem, MenuList } from "@chakra-ui/react";
import { useGetSectionType } from "hooks/useSectionType";
import { useUndeck } from "hooks/useUndeck";
import { DECK } from "utils/constants";

import { ContextMenuCore } from "./ContextMenuCore";

export function NodeContextMenu(props) {
  const { nodeId, closeContextMenu } = props;
  const [sectionType] = useGetSectionType(nodeId, ["type"]);
  const nodeIsDeck = sectionType === DECK;
  const undeck = useUndeck(nodeId);

  function onClick() {
    undeck();
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
