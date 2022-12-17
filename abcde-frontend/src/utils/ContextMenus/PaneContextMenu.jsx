import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
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
      <DropdownMenu.Item onClick={() => onClick(false)}>
        New Section
      </DropdownMenu.Item>
      <DropdownMenu.Item onClick={() => onClick(true)}>
        New Deck
      </DropdownMenu.Item>
    </ContextMenuCore>
  );
}
