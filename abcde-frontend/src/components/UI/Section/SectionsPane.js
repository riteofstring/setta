import { useStoreActions, useStoreState } from "easy-peasy";
import { useSectionGroups } from "hooks/useSectionGroups";
import { useSetSectionPosition } from "hooks/useSetSectionPosition";
import React from "react";
import ReactFlow, { Controls } from "react-flow-renderer";
import { PANEID } from "utils/constants";

import { SectionContainerNode } from "./SectionContainer/SectionContainerNode";

function SectionsPane() {
  const topLevelSectionIds = useStoreState(x=>x.sectionInfos.topLevelSectionIds)
  const refForPosition = useSetSectionPosition(PANEID);

  const elements = topLevelSectionIds.map((e, idx) => ({
    id: e,
    position: { x: 250, y: 1000 * idx },
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
