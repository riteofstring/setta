import { useMouseToReactFlowPosition } from "hooks/useMouseToReactFlowPosition";
import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { addSectionAtPosition } from "thunks/sections/addSectionAtPosition";
import { updateManyCurrChildren } from "thunks/sections/children";
import { updateManyParamsAndCallables } from "thunks/sections/sectionContents";
import { moveSections } from "thunks/sections/sectionOps";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { PANEID } from "utils/constants";
import { newSectionPosition } from "z_utils/objs/sectionPosition";

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

    topLevelPosition.zIndex = 0;

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

  return ({
    sections,
    uiTypes,
    evCols,
    uiTypeCols,
    codeInfo,
    topLevelIds,
    x,
    y,
    callbackBeforeExit,
    incrementVersion,
  }) => {
    // see https://reactflow.dev/docs/examples/interaction/drag-and-drop/
    const topLevelPosition = getPosition(x, y);
    const topLevelMapping = topLevelIds.map((i) => [
      i,
      { ...topLevelPosition, zIndex: 0 },
    ]);

    useUITypes.getState().update(uiTypes);
    useParamInfos.getState().update({ evCols, uiTypeCols });
    useCodeInfo.getState().update(codeInfo);
    useSectionInfos.getState().update(sections);
    updateManyParamsAndCallables(Object.keys(sections));
    updateManyCurrChildren(Object.keys(sections));
    useProjectConfig
      .getState()
      .addChildren(Object.fromEntries(topLevelMapping));

    callbackBeforeExit();
    maybeIncrementProjectStateVersion(incrementVersion);
  };
}
