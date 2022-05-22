import { useStoreState } from "easy-peasy";
import React from "react";
import ReactFlow, { Controls, useNodesState } from "react-flow-renderer";

import { SectionContainerNode } from "./SectionContainer/SectionContainerNode";

const nodeTypes = { sectionContainerNode: SectionContainerNode };

function SectionsPane({ setReactFlowInstance }) {
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

  return (
    <ReactFlow
      nodes={nodes}
      minZoom={0.1}
      maxZoom={10}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      // onLoad={setReactFlowInstance}
    >
      <Controls />
    </ReactFlow>
  );
}

export default React.memo(SectionsPane);
