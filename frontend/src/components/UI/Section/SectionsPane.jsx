import { ReactFlow } from "forks/xyflow/core";
import "forks/xyflow/core/styles/style.css";
import React from "react";
import { REACT_FLOW_STORE } from "utils/constants";
import "./react-flow-css.css";

const reactFlowStyle = {
  // background: "#94a3b8",
  height: "100%",
  userSelect: "none", //to prevent text from being selected when shift clicking or right-clicking pane
};

function _SectionsPane() {
  return (
    <ReactFlow
      minZoom={0.1}
      maxZoom={10}
      style={reactFlowStyle}
      defaultViewport={REACT_FLOW_STORE.initialViewport}
      nodeDragThreshold={0}
      className="rcbg-light dark:rcbg-dark"
    />
  );
}

export const SectionsPane = React.memo(_SectionsPane);
