import { usePanes } from "models/panes";
import { useStoreApi } from "react-flow-renderer";
import { addSectionAtPosition } from "thunks/sections/addSectionAtPosition";
import { OVERVIEW } from "utils/constants";

export function useAddSectionInEmptySpace({ isDeck }: { isDeck: boolean }) {
  const store = useStoreApi();

  return () => {
    const {
      transform: [_x, _y, zoom],
    } = store.getState();
    const overviewWidth = usePanes.getState().trueWidth[OVERVIEW];

    const x = (overviewWidth - _x) / zoom;
    const y = -_y / zoom;

    addSectionAtPosition({
      isDeck,
      initialPosition: { x, y },
    });
  };
}
