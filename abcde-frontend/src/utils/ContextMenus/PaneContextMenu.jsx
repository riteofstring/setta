import { ContextMenuCore, ContextMenuItem } from "./ContextMenuCore";
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
      <ContextMenuItem onClick={() => onClick(false)}>
        New Section
      </ContextMenuItem>
      <ContextMenuItem onClick={() => onClick(true)}>New Deck</ContextMenuItem>
    </ContextMenuCore>
  );
}
