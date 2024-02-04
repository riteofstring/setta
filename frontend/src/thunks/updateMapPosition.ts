import { REACT_FLOW_STORE } from "utils/constants";

export function updateMapPosition(widthDiff: number) {
  const {
    transform: [x, y, zoom],
  } = REACT_FLOW_STORE.store.getState();
  REACT_FLOW_STORE.rf.setViewport(
    { x: x + widthDiff, y, zoom },
    {
      duration: 100,
    },
  );
}
