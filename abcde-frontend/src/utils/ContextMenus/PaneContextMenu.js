import { MenuList, MenuItem } from "@chakra-ui/react";

import { ContextMenuCore } from "./ContextMenuCore";
import { useOnClickAddSection } from "./utils";

export function PaneContextMenu(props) {
  const onClick = useOnClickAddSection(props);

  return (
    <ContextMenuCore {...props}>
      <MenuList>
        <MenuItem onClick={onClick(false)}>New Section</MenuItem>
        <MenuItem onClick={onClick(true)}>New Deck</MenuItem>
      </MenuList>
    </ContextMenuCore>
  );
}
