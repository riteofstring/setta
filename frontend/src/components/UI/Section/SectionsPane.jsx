import { useActiveSection } from "models/activeSection";
import React, { useCallback, useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { REACT_FLOW_STORE } from "utils/constants";
import { ReactFlow } from "xyflow/core";
import "xyflow/core/styles/style.css";
import { NodesSelectionWrapper } from "../NodesSelection";
import { getNodesInside } from "./getSelectedNodes";
import "./react-flow-css.css";
import { SectionContainerNode } from "./SectionContainer/SectionContainerNode";

const nodeTypes = { sectionContainerNode: SectionContainerNode };

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

function getNodesInsideSelection(...props) {
  return getNodesInside(...props);
}

function onInit(rf) {
  REACT_FLOW_STORE.rf = rf;
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
    [],
  );

  useDeepCompareEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes]);

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
      onPaneClick={onPaneClick}
      onMoveStart={closeCtxMenus}
      onInit={onInit}
      getNodesInsideSelection={getNodesInsideSelection}
      nodeDragThreshold={1}
      className="rcbg-light dark:rcbg-dark"
    >
      <NodesSelectionWrapper
      // onSelectionContextMenu={onSelectionContextMenu}
      // noPanClassName={noPanClassName}
      // disableKeyboardA11y={disableKeyboardA11y}
      />
    </ReactFlow>
  );
}

export const SectionsPane = React.memo(_SectionsPane);
