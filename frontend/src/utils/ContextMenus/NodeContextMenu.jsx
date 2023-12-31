import { useGetSectionType } from "hooks/useSectionType";
import { undeck } from "hooks/useUndeck";
import { Item } from "utils/atoms/dropdown/item";
import { DECK } from "z_utils/constants";
import { ContextMenuCore } from "./ContextMenuCore";

export function NodeContextMenu(props) {
  const { nodeId, closeContextMenu } = props;
  const sectionType = useGetSectionType(nodeId, "type");
  const nodeIsDeck = sectionType === DECK;
  function onClick() {
    undeck(nodeId);
    closeContextMenu();
  }

  return nodeIsDeck ? (
    <ContextMenuCore {...props}>
      <Item onClick={onClick}>Undeck</Item>
    </ContextMenuCore>
  ) : null;
}
