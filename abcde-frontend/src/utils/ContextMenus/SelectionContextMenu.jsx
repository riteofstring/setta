import { MenuItem, MenuList } from "@chakra-ui/react";
import { deleteSections, moveSections } from "thunks/sectionOps";
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
    moveSections({ newParentId: deckId, sectionIds: nodeIds });
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
      <MenuList zIndex={10}>
        <MenuItem onClick={() => onClickCreateDeck(true)}>Create Deck</MenuItem>
        <MenuItem onClick={onClickDelete}>Delete</MenuItem>
      </MenuList>
    </ContextMenuCore>
  );
}
