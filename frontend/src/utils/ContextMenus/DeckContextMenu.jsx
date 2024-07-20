import _ from "lodash";
import { useContextMenus } from "models/contextMenus";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { undeck } from "thunks/undeck";
import { Item } from "utils/atoms/dropdown/item";
import { ContextMenuCore } from "./ContextMenuCore";

export function DeckContextMenu() {
  const { isOpen, x, y, sectionId } = useContextMenus((x) => x.deck, _.isEqual);
  const closeContextMenu = () => useContextMenus.getState().closeAll();
  function onClickUndeck() {
    undeck(sectionId);
    closeContextMenu();
  }

  function onClickToggleOrientation() {
    useSectionInfos.getState().toggleOrientation({ sectionId });
    closeContextMenu();
  }

  return (
    <ContextMenuCore
      x={x}
      y={y}
      closeContextMenu={closeContextMenu}
      isOpen={isOpen}
    >
      <Item onClick={onClickUndeck}>Undeck</Item>
      <Item onClick={onClickToggleOrientation}>Toggle Orientation</Item>
    </ContextMenuCore>
  );
}
