import C from "constants/constants.json";
import { undeck } from "state/actions/sections/groupSections";
import { useGetSectionType } from "state/hooks/uiTypes";
import { Item } from "utils/atoms/dropdown/item";
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
