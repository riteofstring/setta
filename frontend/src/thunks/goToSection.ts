import { useActiveSection } from "models/activeSection";
import { useSectionInfos } from "models/info/sectionInfos";
import { usePanes } from "models/panes";
import { useSectionRefs } from "models/sectionRefs";
import { OVERVIEW, REACT_FLOW_STORE } from "utils/constants";
import { getHighestAncestor } from "./sections/sectionSizes";
import { useSectionPositions } from "models/info/sectionPositions";

export function relativePos(sectionId) {
  const s = useSectionRefs.getState();
  const ref = s.withNested[sectionId].getBoundingClientRect();
  return { y: ref.y, x: ref.x };
}

export function goToSection(sectionId: string) {
  const overviewWidth = usePanes.getState().trueWidth[OVERVIEW];
  const margin = 20;
  const { width, height } = REACT_FLOW_STORE.store.getState();
  const { x, y } = trueSectionPosition(sectionId);
  const newX = x + width / 2 - overviewWidth - margin;
  const newY = y + height / 2 - margin;
  REACT_FLOW_STORE.rf.setCenter(newX, newY, {
    zoom: 1,
    duration: 100,
  });
  useActiveSection.getState().setIds([sectionId]);
}

export function trueSectionPosition(sectionId) {
  const positions = useSectionPositions.getState().x;
  const { x, y } = positions[sectionId].position;
  if (useSectionInfos.getState().x[sectionId].parentId) {
    const highestAncestor = getHighestAncestor(sectionId);
    const ancestorPos = positions[highestAncestor].position;
    return { x: ancestorPos.x + x, y: ancestorPos.y + y };
  }
  return { x, y };
}
