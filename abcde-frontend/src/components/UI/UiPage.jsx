import { useTopLevelSectionPositions } from "hooks/useProjectConfig";
import React from "react";
import SectionsPane from "./Section/SectionsPane";

const UiPage = () => {
  const [topLevelIds, topLevelPositions] = useTopLevelSectionPositions();
  const initialNodes = topLevelIds.map((x, idx) => ({
    id: x,
    position: topLevelPositions[idx],
    type: "sectionContainerNode",
  }));

  return <SectionsPane initialNodes={initialNodes} />;
};

export default React.memo(UiPage);
