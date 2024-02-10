import { usePanes } from "models/panes";
import { addSectionAtPosition } from "thunks/sections/addSectionAtPosition";
import { OVERVIEW, REACT_FLOW_STORE } from "utils/constants";

export function addSectionInEmptySpace({
  type,
  inputSectionProps = {},
}: {
  type: string;
  inputSectionProps: any;
}) {
  const store = REACT_FLOW_STORE.store;
  const {
    transform: [_x, _y, zoom],
  } = store.getState();
  const overviewWidth = usePanes.getState().trueWidth[OVERVIEW];

  const x = (overviewWidth - _x) / zoom;
  const y = -_y / zoom;

  const position = { x, y };

  return addSectionAtPosition({
    type,
    inputSectionProps,
    position,
    incrementVersion: true,
  });
}
