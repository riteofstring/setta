import _ from "lodash";
import { clearActiveSectionIds } from "state/actions/activeSection";
import { closeAllContextMenus } from "state/actions/contextMenus";
import { createDeck } from "state/actions/createSectionOrDeck";
import { deleteSections } from "state/actions/sectionOps";
import { useContextMenus } from "state/definitions/contextMenus";
import { Item } from "utils/atoms/dropdown/item";
import { useReactFlow } from "xyflow/core/store";
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
