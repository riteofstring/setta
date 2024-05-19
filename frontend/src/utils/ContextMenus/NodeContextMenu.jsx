import { useGetSectionType } from "hooks/useSectionType";
import { undeck } from "thunks/undeck";
import { Item } from "utils/atoms/dropdown/item";
import { C } from "utils/constants";
import { ContextMenuCore } from "./ContextMenuCore";

export function NodeContextMenu(props) {
  const { nodeId, closeContextMenu } = props;
  const sectionType = useGetSectionType(nodeId, "type");
  const nodeIsDeck = sectionType === C.DECK;
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
