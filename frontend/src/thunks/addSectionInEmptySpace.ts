import { usePanes } from "models/panes";
import { addSectionAtPosition } from "thunks/sections/addSectionAtPosition";
import { OVERVIEW, REACT_FLOW_STORE } from "utils/constants";
import { newSectionPosition } from "z_utils/objs/sectionPosition";

export function addSectionInEmptySpace({ type }: { type: string }) {
  const store = REACT_FLOW_STORE.store;
  const {
    transform: [_x, _y, zoom],
  } = store.getState();
  const overviewWidth = usePanes.getState().trueWidth[OVERVIEW];

  const x = (overviewWidth - _x) / zoom;
  const y = -_y / zoom;

  addSectionAtPosition({
    type,
    topLevelPosition: newSectionPosition({ x, y, zIndex: 0 }),
    incrementVersion: true,
  });
}
