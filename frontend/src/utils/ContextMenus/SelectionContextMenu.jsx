import { createDeck } from "hooks/useCreateSectionOrDeck";
import { deleteSections } from "thunks/sections/sectionOps";
import { Item } from "utils/atoms/dropdown/item";
import { ContextMenuCore } from "./ContextMenuCore";

export function SelectionContextMenu({
  x,
  y,
  closeContextMenu,
  nodeIds,
  ...props
}) {
  const onClickProps = {
    nodeIds,
    x,
    y,
    callbackBeforeExit: closeContextMenu,
    projectXY: true,
  };

  function onClickDelete() {
    deleteSections({ sectionIds: nodeIds, incrementVersion: true });
    closeContextMenu();
  }

  return (
    <ContextMenuCore x={x} y={y} closeContextMenu={closeContextMenu} {...props}>
      <Item onClick={() => createDeck(onClickProps)}>Create Group</Item>
      <Item onClick={onClickDelete}>Delete</Item>
    </ContextMenuCore>
  );
}
