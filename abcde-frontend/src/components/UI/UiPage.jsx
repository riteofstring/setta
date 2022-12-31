import { useTopLevelSectionPositions } from "hooks/useProjectConfig";
import React from "react";
import { GlobalDndContext } from "utils/DNDSortable/GlobalDndContext";
import SectionsPane from "./Section/SectionsPane";

const UiPage = () => {
  const [topLevelIds, topLevelPositions] = useTopLevelSectionPositions();
  const initialNodes = topLevelIds.map((x, idx) => ({
    id: x,
    position: topLevelPositions[idx],
    type: "sectionContainerNode",
  }));

  return (
    <GlobalDndContext>
      <SectionsPane initialNodes={initialNodes} />
    </GlobalDndContext>
  );
};

export default React.memo(UiPage);
