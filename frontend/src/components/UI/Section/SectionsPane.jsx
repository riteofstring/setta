import { useActiveSection } from "models/activeSection";
import { useCodeInfo } from "models/info/codeInfo";
import React, { useCallback, useState } from "react";
import ReactFlow from "reactflow";
import "reactflow/dist/style.css";
import { setPositionAndZIndices } from "thunks/sections/sectionPositions";
import useDeepCompareEffect from "use-deep-compare-effect";
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

function onSelectionChange({ nodes }) {
  if (REACT_FLOW_STORE.store?.getState().userSelectionActive) {
    useActiveSection.getState().setIds(nodes.map((x) => x.id));
  }
}

function onInit(rf) {
  REACT_FLOW_STORE.rf = rf;
}

function onPaneClickHelper(e) {
  useActiveSection.getState().clear();
  useCodeInfo.getState().clearSelected();
  REACT_FLOW_STORE.lastPaneClickLocation =
    REACT_FLOW_STORE.rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
}

// This is a bit more efficient than the one returned by react flow's useNodesState.
// Not sure if worth it though.
function applyNodeChanges(changes, nodes) {
  const newNodes = { ...nodes };
  for (const c of changes) {
    switch (c.type) {
      case "select": {
        newNodes[c.id].selected = c.selected;
        break;
      }
      case "position": {
        if (typeof c.position !== "undefined") {
          newNodes[c.id].position = c.position;
        }
        break;
      }
      case "add": {
        newNodes[c.item.id] = c.item;
        break;
      }
      case "remove": {
        delete newNodes[c.id];
        break;
      }
    }
  }
  return newNodes;
}

function _SectionsPane({
  initialNodes,
  closeCtxMenus,
  openPaneCtxMenu,
  openSelectionCtxMenu,
  openNodeCtxMenu,
}) {
  const [nodes, setNodes] = useState(initialNodes);

  const onNodesChange = useCallback(
    (changes) => setNodes((x) => applyNodeChanges(changes, x)),
    []
  );

  useDeepCompareEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes]);

  function onPaneClick(e) {
    closeCtxMenus();
    onPaneClickHelper(e);
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
      onSelectionChange={onSelectionChange}
      onInit={onInit}
      nodeDragThreshold={1}
      className="rcbg-light dark:rcbg-dark"
    />
  );
}

export const SectionsPane = React.memo(_SectionsPane);
