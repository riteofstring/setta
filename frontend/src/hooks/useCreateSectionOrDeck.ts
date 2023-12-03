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
import { screenToFlowPosition } from "utils/reactFlowUtils";
import { newSectionPosition } from "z_utils/objs/sectionPosition";

export function createDeck({ nodeIds, x, y, callbackBeforeExit, projectXY }) {
  function getCallbackBeforeExit({ nodeIds, callbackBeforeExit }) {
    return (deckId) => {
      moveSections({
        oldParentId: PANEID,
        newParentId: deckId,
        sectionIds: nodeIds,
      });
      callbackBeforeExit?.(deckId);
    };
  }

  onClickAddSection({
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
}

export function onClickAddSection({
  isDeck,
  x,
  y,
  callbackBeforeExit,
  projectXY,
  incrementVersion,
}) {
  // see https://reactflow.dev/docs/examples/interaction/drag-and-drop/
  const topLevelPosition = projectXY
    ? screenToFlowPosition({ x, y })
    : newSectionPosition({ x, y });

  topLevelPosition.zIndex = 0;

  addSectionAtPosition({
    isDeck,
    topLevelPosition,
    callbackBeforeExit,
    incrementVersion,
  });
}

export function useLoadSectionIntoState() {
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
    const topLevelPosition = screenToFlowPosition({ x, y });
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
