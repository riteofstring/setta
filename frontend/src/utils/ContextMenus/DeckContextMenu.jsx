import _ from "lodash";
import { useContextMenus } from "models/contextMenus";
import { undeck } from "thunks/undeck";
import { Item } from "utils/atoms/dropdown/item";
import { ContextMenuCore } from "./ContextMenuCore";

export function DeckContextMenu() {
  const { isOpen, x, y, sectionId } = useContextMenus((x) => x.deck, _.isEqual);
  const closeContextMenu = () => useContextMenus.getState().closeAll();
  function onClick() {
    undeck(sectionId);
    closeContextMenu();
  }

  return (
    <ContextMenuCore
      x={x}
      y={y}
      closeContextMenu={closeContextMenu}
      isOpen={isOpen}
    >
      <Item onClick={onClick}>Undeck</Item>
    </ContextMenuCore>
  );
}
