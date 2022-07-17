import { MenuList, MenuItem } from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { useAddToDeck } from "hooks/useAddToDeck";

import { ContextMenuCore } from "./ContextMenuCore";
import { useOnClickAddSection } from "./utils";

export function SelectionContextMenu(props) {
  const { nodeIds, closeContextMenu } = props;
  const deleteSections = useStoreActions((x) => x.sectionInfos.deleteSections);
  const addToDeck = useAddToDeck();
  function afterAddSection(deckId) {
    addToDeck(deckId, nodeIds);
  }

  const onClickCreateDeck = useOnClickAddSection({ ...props, afterAddSection });
  function onClickDelete() {
    deleteSections({ sectionIds: nodeIds });
    closeContextMenu();
  }

  return (
    <ContextMenuCore {...props}>
      <MenuList zIndex={10}>
        <MenuItem onClick={onClickCreateDeck(true)}>Create Deck</MenuItem>
        <MenuItem onClick={onClickDelete}>Delete</MenuItem>
      </MenuList>
    </ContextMenuCore>
  );
}
