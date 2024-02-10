import _ from "lodash";
import { useContextMenus } from "models/contextMenus";
import { createDeck } from "thunks/createSectionOrDeck";
import { deleteSections } from "thunks/sections/sectionOps";
import { Item } from "utils/atoms/dropdown/item";
import { ContextMenuCore } from "./ContextMenuCore";

export function SelectionContextMenu({ nodeIds }) {
  const { isOpen, x, y } = useContextMenus((x) => x.selection, _.isEqual);
  const closeContextMenu = () => useContextMenus.getState().closeAll();

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
    <ContextMenuCore
      x={x}
      y={y}
      isOpen={isOpen}
      closeContextMenu={closeContextMenu}
    >
      <Item onClick={() => createDeck(onClickProps)}>Create Group</Item>
      <Item onClick={onClickDelete}>Delete</Item>
    </ContextMenuCore>
  );
}
