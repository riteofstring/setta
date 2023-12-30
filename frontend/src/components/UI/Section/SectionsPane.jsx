import { useActiveSection } from "models/activeSection";
import { useProjectConfig } from "models/info/projectConfig";
import React from "react";
import ReactFlow, { useNodesState } from "reactflow";
import "reactflow/dist/style.css";
import { setPositionAndZIndices } from "thunks/sections/sectionPositions";
import useDeepCompareEffect from "use-deep-compare-effect";
import "./react-flow-css.css";
import { SectionContainerNode } from "./SectionContainer/SectionContainerNode";

const nodeTypes = { sectionContainerNode: SectionContainerNode };

const reactFlowStyle = {
  // background: "#94a3b8",
  height: "100%",
  userSelect: "none", //to prevent text from being selected when shift clicking or right-clicking pane
};

function onMoveEnd(e, viewport) {
  useProjectConfig.getState().setViewport(viewport);
}

function onNodeDragStop(e, node, nodes) {
  setPositionAndZIndices(nodes);
}

function onSelectionDragStop(e, nodes) {
  setPositionAndZIndices(nodes);
}

function _SectionsPane({
  initialNodes,
  viewport,
  closeCtxMenus,
  openPaneCtxMenu,
  openSelectionCtxMenu,
  openNodeCtxMenu,
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);

  useDeepCompareEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes]);

  function onPaneClick() {
    closeCtxMenus();
    useActiveSection.getState().setId(null);
  }

  return (
    <ReactFlow
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
    />
  );
}

export const SectionsPane = React.memo(_SectionsPane);
