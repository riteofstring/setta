import { usePanes } from "models/panes";
import { addSectionAtPosition } from "thunks/sections/addSectionAtPosition";
import { OVERVIEW } from "utils/constants";
import { useReactFlow } from "xyflow/core/store";

export function addSectionInEmptySpace({
  type,
  inputSectionProps = {},
  positionOffset = { x: 0, y: 0 },
}: {
  type: string;
  inputSectionProps: any;
}) {
  const {
    transform: [_x, _y, zoom],
  } = useReactFlow.getState();
  const overviewWidth = usePanes.getState().trueWidth[OVERVIEW];

  const x = (overviewWidth - _x) / zoom;
  const y = -_y / zoom;

  const position = { x: x + positionOffset.x, y: y + positionOffset.y };

  return addSectionAtPosition({
    type,
    inputSectionProps,
    position,
    incrementVersion: true,
  });
}
