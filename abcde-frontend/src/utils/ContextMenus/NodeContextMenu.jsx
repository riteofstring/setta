import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
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
      <DropdownMenu.Item onClick={onClick}>Undeck</DropdownMenu.Item>
    </ContextMenuCore>
  ) : null;
}
