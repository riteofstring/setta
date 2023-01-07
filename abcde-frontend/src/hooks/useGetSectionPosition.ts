import { usePanes } from "models/panes";
import { useSectionRefs } from "models/sectionRefs";
import { useReactFlow, useStoreApi } from "reactflow";
import { OVERVIEW, PANEID } from "utils/constants";

export function relativePos(sectionId) {
  const s = useSectionRefs.getState();
  const ref = s.x[sectionId].getBoundingClientRect();
  const paneRef = s.x[PANEID].getBoundingClientRect();
  return { y: ref.y - paneRef.y, x: ref.x - paneRef.x };
}

export function useGoToSection(sectionId: string) {
  const { project, setCenter } = useReactFlow();
  const store = useStoreApi(); // height and width of the react flow container

  return () => {
    const overviewWidth = usePanes.getState().trueWidth[OVERVIEW];
    const margin = 20;
    const { width, height } = store.getState();
    const { x, y } = project(relativePos(sectionId));
    const newX = x + width / 2 - overviewWidth - margin;
    const newY = y + height / 2 - margin;
    setCenter(newX, newY, {
      zoom: 1,
      duration: 25,
    });
  };
}
