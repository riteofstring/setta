import { useActiveSection } from "models/activeSection";
import React, { useCallback, useState } from "react";
import ReactFlow from "reactflow";
import "reactflow/dist/style.css";
import { setPositionAndZIndices } from "thunks/sections/sectionPositions";
import { REACT_FLOW_STORE } from "utils/constants";
import "./react-flow-css.css";
import { SectionContainerNode } from "./SectionContainer/SectionContainerNode";

const nodeTypes = { sectionContainerNode: SectionContainerNode };

const reactFlowStyle = {
  // background: "#94a3b8",
  height: "100%",
  userSelect: "none", //to prevent text from being selected when shift clicking or right-clicking pane
};

function onNodeDragStop(e, node, nodes) {
  setPositionAndZIndices(nodes);
}

function onSelectionDragStop(e, nodes) {
  setPositionAndZIndices(nodes);
}

//TODO figure out how to make this work better
function onSelectionChange({ nodes }) {
  useActiveSection.getState().setIds(nodes.map((x) => x.id));
}

function onSelectionEnd() {
  const selectedAccordingToRf = [
    ...REACT_FLOW_STORE.store.getState().nodeInternals,
  ].filter((x) => x[1].selected);
  useActiveSection.getState().setIds(selectedAccordingToRf.map((x) => x[0]));
}

function onInit(rf) {
  REACT_FLOW_STORE.rf = rf;
}

function _SectionsPane({
  initialNodes,
  closeCtxMenus,
  openPaneCtxMenu,
  openSelectionCtxMenu,
  openNodeCtxMenu,
}) {
  const [nodes, setNodes] = useState(initialNodes);

  const onNodesChange = useCallback((changes) => {
    const newNodes = { ...nodes };
    for (const c of changes) {
      if (typeof c.position !== "undefined") {
        newNodes[c.id].position = c.position;
      }
    }
    setNodes(newNodes);
  }, []);

  // useDeepCompareEffect(() => {
  //   setNodes(initialNodes);
  // }, [initialNodes]);

  function onPaneClick(e) {
    closeCtxMenus();
    useActiveSection.getState().clear();
    REACT_FLOW_STORE.lastPaneClickLocation =
      REACT_FLOW_STORE.rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
  }

  return (
    <ReactFlow
      nodes={Object.values(nodes)}
      minZoom={0.1}
      maxZoom={10}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      style={reactFlowStyle}
      defaultViewport={REACT_FLOW_STORE.initialViewport}
      // snapGrid={[32, 32]}
      // snapToGrid={true}
      onPaneContextMenu={openPaneCtxMenu}
      onSelectionContextMenu={openSelectionCtxMenu}
      onNodeContextMenu={openNodeCtxMenu}
      onPaneClick={onPaneClick}
      onMoveStart={closeCtxMenus}
      onNodeDragStop={onNodeDragStop}
      onSelectionDragStop={onSelectionDragStop}
      // onSelectionChange={onSelectionChange}
      onSelectionEnd={onSelectionEnd}
      onInit={onInit}
      nodeDragThreshold={1}
      className="rcbg-light dark:rcbg-dark"
    />
  );
}

export const SectionsPane = React.memo(_SectionsPane);
