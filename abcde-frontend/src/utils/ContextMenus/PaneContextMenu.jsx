import { MenuItem, MenuList } from "@chakra-ui/react";

import { ContextMenuCore } from "./ContextMenuCore";
import { useOnClickAddSection } from "./utils";

export function PaneContextMenu({
  x,
  y,
  closeContextMenu,
  reactFlowRef,
  ...props
}) {
  const onClick = useOnClickAddSection({
    x,
    y,
    closeContextMenu,
    reactFlowRef,
  });

  return (
    <ContextMenuCore x={x} y={y} closeContextMenu={closeContextMenu} {...props}>
      <MenuList zIndex={10}>
        <MenuItem onClick={() => onClick(false)}>New Section</MenuItem>
        <MenuItem onClick={() => onClick(true)}>New Deck</MenuItem>
      </MenuList>
    </ContextMenuCore>
  );
}
