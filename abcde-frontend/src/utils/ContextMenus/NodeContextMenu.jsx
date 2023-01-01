import { DECK } from "abcde-utils/src/constants";
import { useGetSectionType } from "hooks/useSectionType";
import { useUndeck } from "hooks/useUndeck";
import { Item } from "utils/atoms/dropdown/item";

import { ContextMenuCore } from "./ContextMenuCore";

export function NodeContextMenu(props) {
  const { nodeId, closeContextMenu } = props;
  const sectionType = useGetSectionType(nodeId, "type");
  const nodeIsDeck = sectionType === DECK;
  const undeck = useUndeck(nodeId, closeContextMenu);

  return nodeIsDeck ? (
    <ContextMenuCore {...props}>
      <Item onClick={undeck}>Undeck</Item>
    </ContextMenuCore>
  ) : null;
}
