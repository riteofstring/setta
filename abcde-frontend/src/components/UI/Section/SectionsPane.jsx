import { useSectionRefAndInit } from "hooks/useStateRef";
import { useActiveSection } from "models/activeSection";
import { useProjectConfig } from "models/info/projectConfig";
import React from "react";
import ReactFlow, { useNodesState } from "reactflow";
import "reactflow/dist/style.css";
import { setPositionAndZIndices } from "thunks/sections/sectionPositions";
import useDeepCompareEffect from "use-deep-compare-effect";
import { PANEID } from "utils/constants";
import { NodeContextMenu } from "utils/ContextMenus/NodeContextMenu";
import { PaneContextMenu } from "utils/ContextMenus/PaneContextMenu";
import { SelectionContextMenu } from "utils/ContextMenus/SelectionContextMenu";
import { useAllContextMenus } from "utils/ContextMenus/useContextMenu";
import "./react-flow-css.css";
import { ResponsiveControls } from "./ResponsiveControls";
import { ResponsiveMiniMap } from "./ResponsiveMiniMap";
import { SectionContainerNode } from "./SectionContainer/SectionContainerNode";

const nodeTypes = { sectionContainerNode: SectionContainerNode };

const reactFlowStyle = {
  // background: "#94a3b8",
  height: "100%",
  userSelect: "none", //to prevent text from being selected when shift clicking or right-clicking pane
};

function _SectionsPane({ initialNodes, viewport }) {
  const reactFlowRef = useSectionRefAndInit(PANEID);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);

  useDeepCompareEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes]);

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

  function onMoveEnd(e, viewport) {
    useProjectConfig.getState().setViewport(viewport);
  }

  function onPaneClick() {
    closeCtxMenus();
    useActiveSection.getState().setId(null);
  }

  function onNodeDragStop(e, node, nodes) {
    setPositionAndZIndices(nodes);
  }

  function onSelectionDragStop(e, nodes) {
    setPositionAndZIndices(nodes);
  }

  return (
    <ReactFlow
      ref={reactFlowRef}
      nodes={nodes}
      minZoom={0.1}
      maxZoom={10}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      style={reactFlowStyle}
      defaultViewport={viewport}
      // snapGrid={[32, 32]}
      // snapToGrid={true}
      onMoveEnd={onMoveEnd}
      onPaneContextMenu={openPaneCtxMenu}
      onSelectionContextMenu={openSelectionCtxMenu}
      onNodeContextMenu={openNodeCtxMenu}
      onPaneClick={onPaneClick}
      onMoveStart={closeCtxMenus}
      onNodeDragStop={onNodeDragStop}
      onSelectionDragStop={onSelectionDragStop}
      className="rcbg-light dark:rcbg-dark"
    >
      <PaneContextMenu
        {...paneCtxMenuDetails}
        closeContextMenu={closePaneCtxMenu}
      />
      <SelectionContextMenu
        {...selectionCtxMenuDetails}
        closeContextMenu={closeSelectionCtxMenu}
      />
      {nodeCtxMenuDetails.nodeId && (
        <NodeContextMenu
          {...nodeCtxMenuDetails}
          closeContextMenu={closeNodeCtxMenu}
        />
      )}
      <ResponsiveMiniMap />
      <ResponsiveControls />
      {/* <Background color={colors.slate[300]} size={0.75} gap={16} /> */}
    </ReactFlow>
  );
}

export const SectionsPane = React.memo(_SectionsPane);
