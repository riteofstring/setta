import { useReactFlow } from "xyflow/core/store";

export function updateMapPosition(widthDiff: number) {
  const {
    transform: [x, y, zoom],
  } = useReactFlow.getState();
  useReactFlow.getState().setViewport(
    { x: x + widthDiff, y, zoom },
    {
      duration: 100,
    },
  );
}
