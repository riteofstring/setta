import { MenuItem, MenuList } from "@chakra-ui/react";
import { addToDeck } from "thunks/addToDeck";
import { deleteSections } from "thunks/sectionOps";

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
    addToDeck({ deckId, idsToAdd: nodeIds });
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
