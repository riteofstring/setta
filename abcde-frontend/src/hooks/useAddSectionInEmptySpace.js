import { useStoreActions, useStoreState } from "easy-peasy";
import { useStoreApi } from "react-flow-renderer";
import { OVERVIEW, UI_EDITOR } from "utils/constants";

export function useAddSectionInEmptySpace({ isDeck }) {
  const store = useStoreApi();
  const addSection = useStoreActions((x) => x.thunks.addSectionAtPosition);
  const overviewWidth = useStoreState((x) => x.panes.trueWidth[OVERVIEW]);
  const uiEditorWidth = useStoreState((x) => x.panes.trueWidth[UI_EDITOR]);

  return () => {
    const {
      transform: [_x, _y, zoom],
      width,
      height,
      nodeInternals,
    } = store.getState();
    const left = (overviewWidth - _x) / zoom;
    const top = -_y / zoom;
    const right = left + (width - overviewWidth - uiEditorWidth) / zoom;
    const bottom = top + height / zoom;

    const nodesInView = [...nodeInternals.values()].filter(
      (n) =>
        n.position.x < right &&
        n.position.x + n.width > left &&
        n.position.y < bottom &&
        n.position.y + n.height > top
    );

    console.log(left, top, right, bottom);
    console.log(nodeInternals);
    console.log(nodesInView);

    const x = left;
    const y = top;


    addSection({
      isDeck,
      initialPosition: { x, y },
    });
  };
}



// function getXY({left, top, right, bottm, nodesInView}){
//     if (nodesInView.length === 0){
//         return 
//     }

// }