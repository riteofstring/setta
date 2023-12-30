import { REACT_FLOW_STORE } from "utils/constants";
import { setViewport } from "utils/reactFlowUtils";

export function updateMapPosition(widthDiff: number) {
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
}
