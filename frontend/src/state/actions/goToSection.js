import { localStorageFns } from "state/hooks/localStorageHooks";
import { setCenter } from "xyflow/core/hooks/useViewportHelper";
import { getSectionRect } from "xyflow/core/utils/graph";
import { setActiveSectionIds } from "./activeSection";
import { setZIndices } from "./sectionPositions";

export function goToSection(sectionId) {
  const [overviewWidth] = localStorageFns.overviewTrueWidth.state();
  const { x, y, width, height } = getSectionRect(sectionId);
  const newX = x + width / 2 - overviewWidth;
  const newY = y + height / 2 + 100;
  setCenter(newX, newY, {
    zoom: 1,
    duration: 100,
  });
  setActiveSectionIds([sectionId]);
  setZIndices([sectionId]);
}
