import { useActiveSection } from "models/activeSection";
import { usePanes } from "models/panes";
import { useSectionRefs } from "models/sectionRefs";
import { useReactFlow } from "reactflow";
import { OVERVIEW, REACT_FLOW_STORE } from "utils/constants";
import { screenToFlowPosition } from "../utils/reactFlowUtils";

export function relativePos(sectionId) {
  const s = useSectionRefs.getState();
  const ref = s.x[sectionId].getBoundingClientRect();
  return { y: ref.y, x: ref.x };
}

export function useGoToSection() {
  const { setCenter } = useReactFlow();

  return (sectionId: string) => {
    const store = REACT_FLOW_STORE.store;
    const overviewWidth = usePanes.getState().trueWidth[OVERVIEW];
    const margin = 20;
    const { width, height } = store.getState();
    const { x, y } = screenToFlowPosition(relativePos(sectionId));
    const newX = x + width / 2 - overviewWidth - margin;
    const newY = y + height / 2 - margin;
    setCenter(newX, newY, {
      zoom: 1,
      duration: 100,
    });
    useActiveSection.getState().setId(sectionId);
  };
}
