import { useReactFlow } from "reactflow";
import { REACT_FLOW_STORE } from "utils/constants";

export function useUpdateMapPosition() {
  const { setViewport } = useReactFlow();

  return (widthDiff: number) => {
    const store = REACT_FLOW_STORE.store;
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
