import { usePanes } from "models/panes";
import { useStoreApi } from "react-flow-renderer";
import { addSectionAtPosition } from "thunks/addSectionAtPosition";
import { OVERVIEW } from "utils/constants";

export function useAddSectionInEmptySpace({ isDeck }: { isDeck: boolean }) {
  const store = useStoreApi();
  //   const reactFlowRef = useStoreState((x) => x.reactFlowRef.ref);
  const overviewWidth = usePanes((x) => x.trueWidth[OVERVIEW]);

  return () => {
    const {
      transform: [_x, _y, zoom],
    } = store.getState();
    // const reactFlowBounds = reactFlowRef.current.getBoundingClientRect();

    const x = (overviewWidth - _x) / zoom;
    const y = -_y / zoom;

    addSectionAtPosition({
      isDeck,
      initialPosition: { x, y },
    });
  };
}
