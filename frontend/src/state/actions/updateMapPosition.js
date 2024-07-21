import { setViewport } from "xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "xyflow/core/store";

export function updateMapPosition(widthDiff) {
  const {
    transform: [x, y, zoom],
  } = useReactFlow.getState();
  setViewport(
    { x: x + widthDiff, y, zoom },
    {
      duration: 100,
    },
  );
}
