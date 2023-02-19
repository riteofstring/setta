import { useOnClickAddSection } from "hooks/useCreateSectionOrDeck";
import { Item } from "utils/atoms/dropdown/item";
import { ContextMenuCore } from "./ContextMenuCore";

export function PaneContextMenu({ x, y, closeContextMenu, ...props }) {
  const onClick = useOnClickAddSection();
  const commonProps = {
    x,
    y,
    callbackBeforeExit: closeContextMenu,
    projectXY: true,
  };

  return (
    <ContextMenuCore x={x} y={y} closeContextMenu={closeContextMenu} {...props}>
      <Item onClick={() => onClick({ isDeck: false, ...commonProps })}>
        New Section
      </Item>
      <Item onClick={() => onClick({ isDeck: true, ...commonProps })}>
        New Deck
      </Item>
    </ContextMenuCore>
  );
}
