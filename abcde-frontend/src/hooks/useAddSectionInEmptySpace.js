import { useStoreActions } from "easy-peasy";
import { usePanes } from "models/panes";
import { useStoreApi } from "react-flow-renderer";
import { OVERVIEW } from "utils/constants";

export function useAddSectionInEmptySpace({ isDeck }) {
  const store = useStoreApi();
  const addSection = useStoreActions((x) => x.thunks.addSectionAtPosition);
  //   const reactFlowRef = useStoreState((x) => x.reactFlowRef.ref);
  const overviewWidth = usePanes((x) => x.trueWidth[OVERVIEW]);

  return () => {
    const {
      transform: [_x, _y, zoom],
    } = store.getState();
    // const reactFlowBounds = reactFlowRef.current.getBoundingClientRect();

    const x = (overviewWidth - _x) / zoom;
    const y = -_y / zoom;

    addSection({
      isDeck,
      initialPosition: { x, y },
    });
  };
}
