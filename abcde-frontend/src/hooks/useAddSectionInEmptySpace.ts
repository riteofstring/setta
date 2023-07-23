import { newSectionPosition } from "abcde-utils/src/objs/sectionPosition";
import { usePanes } from "models/panes";
import { addSectionAtPosition } from "thunks/sections/addSectionAtPosition";
import { OVERVIEW, REACT_FLOW_STORE } from "utils/constants";

export function useAddSectionInEmptySpace({ isDeck }: { isDeck: boolean }) {
  return () => {
    const store = REACT_FLOW_STORE.store;
    const {
      transform: [_x, _y, zoom],
    } = store.getState();
    const overviewWidth = usePanes.getState().trueWidth[OVERVIEW];

    const x = (overviewWidth - _x) / zoom;
    const y = -_y / zoom;

    addSectionAtPosition({
      isDeck,
      topLevelPosition: newSectionPosition({ x, y }),
      incrementVersion: true,
    });
  };
}
