import { useStoreState } from "easy-peasy";
import { useSetSectionPosition } from "hooks/useSetSectionPosition";
import React, { useEffect } from "react";
import ReactFlow, {
  Controls,
  useNodesState,
  MiniMap,
} from "react-flow-renderer";
import { PANEID } from "utils/constants";

import { SectionContainerNode } from "./SectionContainer/SectionContainerNode";

const nodeTypes = { sectionContainerNode: SectionContainerNode };

function SectionsPane({ setReactFlowInstance }) {
  const refForPosition = useSetSectionPosition(PANEID);
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

  return (
    <ReactFlow
      ref={refForPosition}
      nodes={nodes}
      minZoom={0.1}
      maxZoom={10}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      // onLoad={setReactFlowInstance}
      style={reactFlowStyle}
      // snapGrid={[32, 32]}
      // snapToGrid={true}
    >
      <MiniMap
        nodeStrokeColor={(n) => {
          if (n.style?.background) return n.style.background;
          if (n.type === "input") return "#0041d0";
          if (n.type === "output") return "#ff0072";
          if (n.type === "default") return "#1a192b";

          return "#7a7a7a";
        }}
        nodeColor={(n) => {
          if (n.style?.background) return n.style.background;

          return "#fff";
        }}
        nodeBorderRadius={2}
      />
      <Controls />
      {/* <Background color="#b3bfd1" size={0.75} gap={16} /> */}
    </ReactFlow>
  );
}

export default React.memo(SectionsPane);
