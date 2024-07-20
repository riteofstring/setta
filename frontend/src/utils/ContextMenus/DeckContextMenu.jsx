import _ from "lodash";
import { closeAllContextMenus } from "state/actions/contextMenus";
import { undeck } from "state/actions/undeck";
import { useContextMenus } from "state/definitions/contextMenus";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { Item } from "utils/atoms/dropdown/item";
import { ContextMenuCore } from "./ContextMenuCore";

export function DeckContextMenu() {
  const { isOpen, x, y, sectionId } = useContextMenus((x) => x.deck, _.isEqual);
  function onClickUndeck() {
    undeck(sectionId);
    closeAllContextMenus();
  }

  function onClickToggleOrientation() {
    useSectionInfos.getState().toggleOrientation({ sectionId });
    closeAllContextMenus();
  }

  return (
    <ContextMenuCore
      x={x}
      y={y}
      closeContextMenu={closeAllContextMenus}
      isOpen={isOpen}
    >
      <Item onClick={onClickUndeck}>Undeck</Item>
      <Item onClick={onClickToggleOrientation}>Toggle Orientation</Item>
    </ContextMenuCore>
  );
}
