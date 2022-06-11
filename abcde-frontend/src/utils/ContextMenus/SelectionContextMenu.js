import { MenuList, MenuItem } from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";

import { ContextMenuCore } from "./ContextMenuCore";

export function SelectionContextMenu(props) {
  const { nodeIds, closeContextMenu } = props;
  const deleteSections = useStoreActions((x) => x.sectionInfos.deleteSections);

  function onClick() {
    deleteSections({ sectionIds: nodeIds });
    closeContextMenu();
  }

  return (
    <ContextMenuCore {...props}>
      <MenuList>
        <MenuItem onClick={onClick}>Delete</MenuItem>
      </MenuList>
    </ContextMenuCore>
  );
}
