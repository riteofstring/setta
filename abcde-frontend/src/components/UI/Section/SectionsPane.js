import { useStoreState } from "easy-peasy";
import { useDragIntoDeck } from "hooks/useAddToDeck";
import { useSetSectionPosition } from "hooks/useSetSectionPosition";
import React from "react";
import ReactFlow, { useNodesState, Background } from "react-flow-renderer";
import useDeepCompareEffect from "use-deep-compare-effect";
import { NodeContextMenu } from "utils/ContextMenus/NodeContextMenu";
import { PaneContextMenu } from "utils/ContextMenus/PaneContextMenu";
import { SelectionContextMenu } from "utils/ContextMenus/SelectionContextMenu";
import { useAllContextMenus } from "utils/ContextMenus/useContextMenu";
import { PANEID } from "utils/constants";

import { ResponsiveControls } from "./ResponsiveControls";
import { ResponsiveMiniMap } from "./ResponsiveMiniMap";
import { SectionContainerNode } from "./SectionContainer/SectionContainerNode";
import "./react-flow-css.css";

const nodeTypes = { sectionContainerNode: SectionContainerNode };

function setInitialToCurrent(initialNodes, nodes) {
  let newNodeStates = _.cloneDeep(initialNodes);
  for (let n of newNodeStates) {
    for (let m of nodes) {
      if (n.id === m.id) {
        // Use position as set by react flow, instead of initialPosition
        n.position = m.position;
        break;
      }
    }
  }
  return newNodeStates;
}

function SectionsPane() {
  const reactFlowRef = useSetSectionPosition(PANEID);
  const topLevelSectionPositions = useStoreState(
    (x) => x.sectionInfos.topLevelSectionPositions
  );

  const initialNodes = topLevelSectionPositions.map((e) => ({
    id: e.id,
    position: e.initialPosition,
    type: "sectionContainerNode",
    // dragHandle: ".TopLevelDragHandle",
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);

  useDeepCompareEffect(() => {
    if (!_.isEqual(_.map(nodes, "id"), _.map(initialNodes, "id"))) {
      const newNodeStates = setInitialToCurrent(initialNodes, nodes);
      setNodes(newNodeStates);
    }
  }, [initialNodes]);

  const reactFlowStyle = {
    background: "#CBD5E0",
    height: "100%",
  };

  const [
    paneCtxMenuDetails,
    openPaneCtxMenu,
    closePaneCtxMenu,
    selectionCtxMenuDetails,
    openSelectionCtxMenu,
    closeSelectionCtxMenu,
    nodeCtxMenuDetails,
    openNodeCtxMenu,
    closeNodeCtxMenu,
    closeCtxMenus,
  ] = useAllContextMenus();

  const [onNodeDrag, onNodeDragStop, onSelectionDrag, onSelectionDragStop] =
    useDragIntoDeck(reactFlowRef);

  return (
    <ReactFlow
      ref={reactFlowRef}
      nodes={nodes}
      minZoom={0.1}
      maxZoom={10}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      style={reactFlowStyle}
      // snapGrid={[32, 32]}
      // snapToGrid={true}
      onPaneContextMenu={openPaneCtxMenu}
      onSelectionContextMenu={openSelectionCtxMenu}
      onNodeContextMenu={openNodeCtxMenu}
      onPaneClick={closeCtxMenus}
      onMoveStart={closeCtxMenus}
      onNodeDrag={onNodeDrag}
      onNodeDragStop={onNodeDragStop}
      onSelectionDrag={onSelectionDrag}
      onSelectionDragStop={onSelectionDragStop}
    >
      <PaneContextMenu
        {...paneCtxMenuDetails}
        closeContextMenu={closePaneCtxMenu}
        reactFlowRef={reactFlowRef}
      />
      <SelectionContextMenu
        {...selectionCtxMenuDetails}
        closeContextMenu={closeSelectionCtxMenu}
        reactFlowRef={reactFlowRef}
      />
      <NodeContextMenu
        {...nodeCtxMenuDetails}
        closeContextMenu={closeNodeCtxMenu}
      />
      <ResponsiveMiniMap />
      <ResponsiveControls />
      <Background color="#b3bfd1" size={0.75} gap={16} />
    </ReactFlow>
  );
}

export default React.memo(SectionsPane);
