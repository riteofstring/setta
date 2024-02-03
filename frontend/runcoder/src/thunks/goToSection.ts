import { useActiveSection } from "models/activeSection";
import { useSectionInfos } from "models/info/sectionInfos";
import { usePanes } from "models/panes";
import { useSectionRefs } from "models/sectionRefs";
import { OVERVIEW, REACT_FLOW_STORE } from "utils/constants";

export function relativePos(sectionId) {
  const s = useSectionRefs.getState();
  const ref = s.withNested[sectionId].getBoundingClientRect();
  return { y: ref.y, x: ref.x };
}

export function goToSection(sectionId: string) {
  const overviewWidth = usePanes.getState().trueWidth[OVERVIEW];
  const margin = 20;
  const { width, height } = REACT_FLOW_STORE.store.getState();
  const { x, y } = useSectionInfos.getState().x[sectionId].position;
  const newX = x + width / 2 - overviewWidth - margin;
  const newY = y + height / 2 - margin;
  REACT_FLOW_STORE.rf.setCenter(newX, newY, {
    zoom: 1,
    duration: 100,
  });
  useActiveSection.getState().setIds([sectionId]);
}
