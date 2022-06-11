import { MenuList, MenuItem } from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";

import { ContextMenuCore } from "./ContextMenuCore";
import { useOnClickAddSection } from "./utils";

export function SelectionContextMenu(props) {
  const { nodeIds, closeContextMenu } = props;
  const deleteSections = useStoreActions((x) => x.sectionInfos.deleteSections);
  const setIdsOverview = useStoreActions(
    (x) => x.sectionInfos.setIdsOverviewThunk
  );
  const setSectionInfoAttr = useStoreActions(
    (x) => x.sectionInfos.setSectionInfoAttr
  );

  function afterAddSection(newId) {
    setIdsOverview({ sectionId: newId, newStateFn: () => nodeIds });
    setSectionInfoAttr({
      sectionIds: nodeIds,
      attr: "isTopLevel",
      value: false,
    });
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
