import { useTopLevelSectionPositions } from "hooks/useProjectConfig";
import { GlobalDndContext } from "utils/DNDSortable/GlobalDndContext";
import { SectionsPane } from "./Section/SectionsPane";

export function UIPage() {
  const { ids, initialPositions, zIndices } = useTopLevelSectionPositions();
  const initialNodes = ids.map((x, idx) => ({
    id: x,
    position: initialPositions[idx],
    type: "sectionContainerNode",
    zIndex: zIndices[idx],
    style: { visibility: "visible" }, // needed to prevent flickering
  }));

  return (
    <GlobalDndContext>
      <SectionsPane initialNodes={initialNodes} />
    </GlobalDndContext>
  );
}
