import { useTopLevelSectionPositions } from "hooks/useProjectConfig";
import { GlobalDndContext } from "utils/DNDSortable/GlobalDndContext";
import { SectionsPane } from "./Section/SectionsPane";

export function UIPage() {
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
}
