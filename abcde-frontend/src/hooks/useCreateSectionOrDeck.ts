import { newSectionPosition } from "abcde-utils/src/objs/sectionPosition";
import { useMouseToReactFlowPosition } from "hooks/useMouseToReactFlowPosition";
import { addSectionAtPosition } from "thunks/sections/addSectionAtPosition";
import { addSectionsToState } from "thunks/sections/createSectionInfo";
import { moveSections } from "thunks/sections/sectionOps";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
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

  return ({ nodeIds, x, y, callbackBeforeExit, projectXY }) => {
    fn({
      isDeck: true,
      x,
      y,
      callbackBeforeExit: getCallbackBeforeExit({
        nodeIds,
        callbackBeforeExit,
      }),
      projectXY,
      incrementVersion: true,
    });
  };
}

export function useOnClickAddSection() {
  const getPosition = useMouseToReactFlowPosition();

  return ({
    isDeck,
    x,
    y,
    callbackBeforeExit,
    projectXY,
    incrementVersion,
  }) => {
    // see https://reactflow.dev/docs/examples/interaction/drag-and-drop/
    const topLevelPosition = projectXY
      ? getPosition(x, y)
      : newSectionPosition({ x, y });

    addSectionAtPosition({
      isDeck,
      topLevelPosition,
      callbackBeforeExit,
      incrementVersion,
    });
  };
}

export function useLoadSectionIntoState() {
  const getPosition = useMouseToReactFlowPosition();

  return ({ sectionInfo, x, y, callbackBeforeExit, incrementVersion }) => {
    // see https://reactflow.dev/docs/examples/interaction/drag-and-drop/
    const topLevelPosition = getPosition(x, y);

    addSectionsToState({ [sectionInfo.id]: sectionInfo }, topLevelPosition);
    callbackBeforeExit();
    maybeIncrementProjectStateVersion(incrementVersion);
  };
}
