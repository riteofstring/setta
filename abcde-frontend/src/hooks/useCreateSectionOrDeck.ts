import { useMouseToReactFlowPosition } from "hooks/useMouseToReactFlowPosition";
import { addSectionAtPosition } from "thunks/sections/addSectionAtPosition";
import { moveSections } from "thunks/sections/sectionOps";
import { PANEID } from "utils/constants";

export function useCreateDeck() {
  function getCallbackBeforeExit({ nodeIds, callbackBeforeExit }) {
    return (deckId) => {
      moveSections({
        oldParentId: PANEID,
        newParentId: deckId,
        sectionIds: nodeIds,
      });
      callbackBeforeExit && callbackBeforeExit(deckId);
    };
  }

  const fn = useOnClickAddSection();

  return ({ nodeIds, x, y, callbackBeforeExit, projectXY }) =>
    fn({
      isDeck: true,
      x,
      y,
      callbackBeforeExit: getCallbackBeforeExit({
        nodeIds,
        callbackBeforeExit,
      }),
      projectXY,
    });
}

export function useOnClickAddSection() {
  const getPosition = useMouseToReactFlowPosition();

  return ({ isDeck, x, y, callbackBeforeExit, projectXY }) => {
    // see https://reactflow.dev/docs/examples/interaction/drag-and-drop/
    const initialPosition = projectXY ? getPosition(x, y) : { x, y };
    addSectionAtPosition({ isDeck, initialPosition, callbackBeforeExit });
  };
}
