import { useActiveSection } from "models/activeSection";
import { usePanes } from "models/panes";
import { useSectionRefs } from "models/sectionRefs";
import { useReactFlow } from "reactflow";
import { OVERVIEW, PANEID, REACT_FLOW_STORE } from "utils/constants";

export function relativePos(sectionId) {
  const s = useSectionRefs.getState();
  const ref = s.x[sectionId].getBoundingClientRect();
  const paneRef = s.x[PANEID].getBoundingClientRect();
  return { y: ref.y - paneRef.y, x: ref.x - paneRef.x };
}

export function useGoToSection(sectionId: string) {
  const { project, setCenter } = useReactFlow();

  return () => {
    const store = REACT_FLOW_STORE.store;
    const overviewWidth = usePanes.getState().trueWidth[OVERVIEW];
    const margin = 20;
    const { width, height } = store.getState();
    const { x, y } = project(relativePos(sectionId));
    const newX = x + width / 2 - overviewWidth - margin;
    const newY = y + height / 2 - margin;
    setCenter(newX, newY, {
      zoom: 1,
      duration: 100,
    });
    useActiveSection.getState().setId(sectionId);
  };
}
