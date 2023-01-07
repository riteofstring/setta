import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { deleteSections, moveSections } from "thunks/sections/sectionOps";
import { PANEID } from "utils/constants";
import { ContextMenuCore } from "./ContextMenuCore";
import { useOnClickAddSection } from "./utils";

export function SelectionContextMenu({
  x,
  y,
  closeContextMenu,
  reactFlowRef,
  nodeIds,
  ...props
}) {
  function afterAddSection(deckId) {
    moveSections({
      oldParentId: PANEID,
      newParentId: deckId,
      sectionIds: nodeIds,
    });
  }

  const onClickCreateDeck = useOnClickAddSection({
    x,
    y,
    closeContextMenu,
    reactFlowRef,
    afterAddSection,
  });

  function onClickDelete() {
    deleteSections({ sectionIds: nodeIds });
    closeContextMenu();
  }

  return (
    <ContextMenuCore x={x} y={y} closeContextMenu={closeContextMenu} {...props}>
      <DropdownMenu.Item onClick={() => onClickCreateDeck(true)}>
        Create Deck
      </DropdownMenu.Item>
      <DropdownMenu.Item onClick={onClickDelete}>Delete</DropdownMenu.Item>
    </ContextMenuCore>
  );
}
