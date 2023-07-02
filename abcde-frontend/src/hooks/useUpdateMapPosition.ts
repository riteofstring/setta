import { useReactFlowStore } from "models/reactFlowStore";
import { useReactFlow } from "reactflow";

export function useUpdateMapPosition() {
  const { setViewport } = useReactFlow();

  return (widthDiff: number) => {
    const store = useReactFlowStore.getState().store;
    const {
      transform: [x, y, zoom],
    } = store.getState();
    setViewport(
      { x: x + widthDiff, y, zoom },
      {
        duration: 100,
      }
    );
  };
}
