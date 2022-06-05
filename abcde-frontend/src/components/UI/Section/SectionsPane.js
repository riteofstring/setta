import { useStoreState } from "easy-peasy";
import { useSetSectionPosition } from "hooks/useSetSectionPosition";
import React, { useEffect, useState } from "react";
import ReactFlow, { useNodesState } from "react-flow-renderer";
import { ContextMenu } from "utils/ContextMenu/ContextMenu";
import { PANEID } from "utils/constants";

import { ResponsiveControls } from "./ResponsiveControls";
import { ResponsiveMiniMap } from "./ResponsiveMiniMap";
import { SectionContainerNode } from "./SectionContainer/SectionContainerNode";
import "./react-flow-css.css";

const nodeTypes = { sectionContainerNode: SectionContainerNode };

function SectionsPane() {
  const reactFlowRef = useSetSectionPosition(PANEID);
  const topLevelSectionPositions = useStoreState(
    (x) => x.sectionInfos.topLevelSectionPositions
  );

  const initialNodes = topLevelSectionPositions.map((e, idx) => ({
    id: e.id,
    position: e.initialPosition,
    type: "sectionContainerNode",
    dragHandle: ".TopLevelDragHandle",
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);

  useEffect(() => {
    if (!_.isEqual(_.map(nodes, "id"), _.map(initialNodes, "id"))) {
      setNodes(initialNodes);
    }
  }, [initialNodes]);

  const reactFlowStyle = {
    background: "#CBD5E0",
    height: "100%",
  };

  // [isOpen, x, y]
  const [contextMenuDetails, setContextMenuDetails] = useState({
    isOpen: false,
    x: 0,
    y: 0,
  });

  function onPaneContextMenu(e) {
    e.preventDefault();
    setContextMenuDetails({ isOpen: true, x: e.clientX, y: e.clientY });
  }

  function closeContextMenu() {
    setContextMenuDetails({ isOpen: false, x: 0, y: 0 });
  }

  return (
    <>
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
        onPaneContextMenu={onPaneContextMenu}
        onPaneClick={closeContextMenu}
        onMove={closeContextMenu}
      >
        <ContextMenu
          {...contextMenuDetails}
          closeContextMenu={closeContextMenu}
          reactFlowRef={reactFlowRef}
        />
        <ResponsiveMiniMap />
        <ResponsiveControls />
        {/* <Background color="#b3bfd1" size={0.75} gap={16} /> */}
      </ReactFlow>
    </>
  );
}

export default React.memo(SectionsPane);
