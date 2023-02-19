import { Item } from "utils/atoms/dropdown/item";
import { ContextMenuCore } from "./ContextMenuCore";
import { useOnClickAddSection } from "./utils";

export function PaneContextMenu({ x, y, closeContextMenu, ...props }) {
  const onClick = useOnClickAddSection({
    x,
    y,
    closeContextMenu,
  });

  return (
    <ContextMenuCore x={x} y={y} closeContextMenu={closeContextMenu} {...props}>
      <Item onClick={() => onClick(false)}>New Section</Item>
      <Item onClick={() => onClick(true)}>New Deck</Item>
    </ContextMenuCore>
  );
}
