import _ from "lodash";
import { closeAllContextMenus } from "state/actions/contextMenus";
import { undeck } from "state/actions/sections/groupSections";
import { toggleSectionOrientation } from "state/actions/sections/sectionInfos";
import { useContextMenus } from "state/definitions";
import { Item } from "components/Utils/atoms/dropdown/item";
import { ContextMenuCore } from "./ContextMenuCore";

export function DeckContextMenu() {
  const { isOpen, x, y, sectionId } = useContextMenus((x) => x.deck, _.isEqual);
  function onClickUndeck() {
    undeck(sectionId);
    closeAllContextMenus();
  }

  function onClickToggleOrientation() {
    toggleSectionOrientation({ sectionId });
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
