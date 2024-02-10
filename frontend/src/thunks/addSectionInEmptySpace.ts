import { usePanes } from "models/panes";
import { addSectionAtPosition } from "thunks/sections/addSectionAtPosition";
import { OVERVIEW } from "utils/constants";
import { useReactFlow } from "xyflow/core/store";

export function addSectionInEmptySpace({
  type,
  inputSectionProps = {},
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

  const position = { x, y };

  return addSectionAtPosition({
    type,
    inputSectionProps,
    position,
    incrementVersion: true,
  });
}
