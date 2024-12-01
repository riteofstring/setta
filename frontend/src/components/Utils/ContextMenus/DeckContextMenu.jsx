import { Item } from "components/Utils/atoms/dropdown/item";
import _ from "lodash";
import { closeAllContextMenus } from "state/actions/contextMenus";
import { undeck } from "state/actions/sections/groupSections";
import { toggleSectionLock } from "state/actions/sectionInfo";
import { toggleSectionOrientation } from "state/actions/sectionInfo";
import { useContextMenus, useSectionInfos } from "state/definitions";
import { ContextMenuCore } from "./ContextMenuCore";

export function DeckContextMenu() {
  const { isOpen, x, y, sectionId } = useContextMenus((x) => x.deck, _.isEqual);

  const { positionAndSizeLocked, isHorizontalOrientation } = useSectionInfos(
    (x) => {
      return {
        positionAndSizeLocked: x.x[sectionId]?.positionAndSizeLocked,
        isHorizontalOrientation: x.x[sectionId]?.isHorizontalOrientation,
      };
    },
    _.isEqual,
  );

  function onClickUndeck() {
    undeck(sectionId);
    closeAllContextMenus();
  }

  function onClickToggleOrientation() {
    toggleSectionOrientation(sectionId);
    closeAllContextMenus();
  }

  function onClickLock() {
    toggleSectionLock(sectionId);
    closeAllContextMenus();
  }

  const orientationItem = isHorizontalOrientation
    ? "Make Vertical"
    : "Make Horizontal";

  const lockItem = positionAndSizeLocked
    ? "Unlock Position & Size"
    : "Lock Position & Size";

  return (
    <ContextMenuCore
      x={x}
      y={y}
      closeContextMenu={closeAllContextMenus}
      isOpen={isOpen}
    >
      <Item onClick={onClickUndeck}>Ungroup</Item>
      <Item onClick={onClickToggleOrientation}>{orientationItem}</Item>
      <Item onClick={onClickLock}>{lockItem}</Item>
    </ContextMenuCore>
  );
}
