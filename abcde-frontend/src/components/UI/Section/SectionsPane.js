import { useStoreState, useStoreActions } from "easy-peasy";
import React from "react";
import ReactFlow, { Controls } from "react-flow-renderer";

import { SectionContainerNode } from "./SectionContainer/SectionContainerNode";

function SectionsPane() {
  const setInstance = useStoreActions((x) => x.reactFlow.setInstance);
  const topLevelSectionPositions = useStoreState(
    (x) => x.sectionInfos.topLevelSectionPositions
  );

  const elements = topLevelSectionPositions.map((e, idx) => ({
    id: e.id,
    position: e.initialPosition,
    type: "special",
    dragHandle: ".TopLevelDragHandle",
  }));

  console.log("elements", elements);

  return (
    <ReactFlow
      elements={elements}
      minZoom={0.1}
      maxZoom={10}
      nodeTypes={{ special: SectionContainerNode }}
      onLoad={setInstance}
    >
      <Controls />
    </ReactFlow>
  );
}

export default React.memo(SectionsPane);
