import { useActiveSection } from "models/activeSection";
import React from "react";
import { REACT_FLOW_STORE } from "utils/constants";
import { ReactFlow } from "xyflow/core";
import "xyflow/core/styles/style.css";
import "./react-flow-css.css";

const reactFlowStyle = {
  // background: "#94a3b8",
  height: "100%",
  userSelect: "none", //to prevent text from being selected when shift clicking or right-clicking pane
};

// function onNodeDragStop(e, node, nodes) {
//   setPositionAndZIndices(nodes);
// }

// function onSelectionDragStop(e, nodes) {
//   setPositionAndZIndices(nodes);
// }

function _SectionsPane({
  closeCtxMenus,
  openPaneCtxMenu,
  openSelectionCtxMenu,
  openNodeCtxMenu,
}) {
  function onPaneClick(e) {
    closeCtxMenus();
    useActiveSection.getState().clear();
    REACT_FLOW_STORE.lastPaneClickLocation =
      REACT_FLOW_STORE.rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
  }

  return (
    <ReactFlow
      minZoom={0.1}
      maxZoom={10}
      style={reactFlowStyle}
      defaultViewport={REACT_FLOW_STORE.initialViewport}
      // snapGrid={[32, 32]}
      // snapToGrid={true}
      nodeDragThreshold={1}
      className="rcbg-light dark:rcbg-dark"
    />
  );
}

export const SectionsPane = React.memo(_SectionsPane);
