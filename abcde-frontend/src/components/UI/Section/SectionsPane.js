import { useStoreState } from "easy-peasy";
import React from "react";
import ReactFlow, { Controls } from "react-flow-renderer";

import { SectionContainerNode } from "./SectionContainer/SectionContainerNode";

function SectionsPane() {
  const sections = useStoreState((x) => _.keys(x.sectionInfos.x), _.isEqual);
  const elements = sections.map((e, idx) => ({
    id: e,
    position: { x: 250, y: 500 * idx },
    type: "special",
  }));

  console.log("elements", elements);

  return (
    <ReactFlow
      elements={elements}
      minZoom={0.1}
      maxZoom={10}
      nodeTypes={{ special: SectionContainerNode }}
    >
      <Controls />
    </ReactFlow>
  );
}

export default React.memo(SectionsPane);
