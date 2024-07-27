import { localStorageFns } from "hooks/localStorageHooks";
import { addSectionAtPosition } from "thunks/sections/addSectionAtPosition";
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
  const [overviewWidth] = localStorageFns.overviewTrueWidth.state();

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
