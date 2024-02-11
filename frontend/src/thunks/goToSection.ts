import { useActiveSection } from "models/activeSection";
import { useSectionInfos } from "models/info/sectionInfos";
import { usePanes } from "models/panes";
import { OVERVIEW } from "utils/constants";
import { setCenter } from "xyflow/core/hooks/useViewportHelper";
import { getSectionRect } from "xyflow/core/utils/graph";
import { setZIndices } from "./sections/sectionPositions";

export function goToSection(sectionId: string) {
  const overviewWidth = usePanes.getState().trueWidth[OVERVIEW];
  const { x, y, width, height } = getSectionRect(sectionId);
  const newX = x + width / 2 - overviewWidth;
  const newY = y + height / 2 + 100;
  setCenter(newX, newY, {
    zoom: 1,
    duration: 100,
  });
  useActiveSection.getState().setIds([sectionId]);
  setZIndices([useSectionInfos.getState().x[sectionId]]);
}
