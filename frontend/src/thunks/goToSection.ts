import { useActiveSection } from "models/activeSection";
import { usePanes } from "models/panes";
import { OVERVIEW, REACT_FLOW_STORE } from "utils/constants";
import { getSectionRect } from "xyflow/core/utils/graph";

export function goToSection(sectionId: string) {
  const overviewWidth = usePanes.getState().trueWidth[OVERVIEW];
  const margin = 20;
  const { width, height } = REACT_FLOW_STORE.store.getState();
  const { x, y } = getSectionRect(sectionId);
  const newX = x + width / 2 - overviewWidth - margin;
  const newY = y + height / 2 - margin;
  REACT_FLOW_STORE.rf.setCenter(newX, newY, {
    zoom: 1,
    duration: 100,
  });
  useActiveSection.getState().setIds([sectionId]);
}
