import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { closeAllContextMenus } from "state/actions/contextMenus";
import { clearActiveSectionIds } from "state/actions/sections/activeSections";
import { deleteSections } from "state/actions/sections/deleteSections";
import { createDeck } from "state/actions/sections/groupSections";
import { useContextMenus } from "state/definitions";
import { Item } from "utils/atoms/dropdown/item";
import { ContextMenuCore } from "./ContextMenuCore";

export function SelectionContextMenu() {
  const { isOpen, x, y, nodeIds } = useContextMenus(
    (x) => x.selection,
    _.isEqual,
  );
  const closeContextMenu = () => {
    closeAllContextMenus();
    clearActiveSectionIds();
    useReactFlow.setState({ nodesSelectionDims: null });
  };

  function onClickCreate() {
    createDeck({
      nodeIds,
      x,
      y,
      projectXY: true,
    });
    closeContextMenu();
  }

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
      <Item onClick={onClickCreate}>Create Group</Item>
      <Item onClick={onClickDelete}>Delete</Item>
    </ContextMenuCore>
  );
}
