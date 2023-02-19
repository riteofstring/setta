import { useSectionRefs } from "models/sectionRefs";
import { useReactFlow } from "reactflow";
import { PANEID } from "utils/constants";

export function useMouseToReactFlowPosition() {
  const { project } = useReactFlow();
  return (x: number, y: number) => {
    const ref = useSectionRefs.getState().x[PANEID];
    const reactFlowBounds = ref.getBoundingClientRect();
    return project({
      x: x - reactFlowBounds.left,
      y: y - reactFlowBounds.top,
    });
  };
}
