import { sendMessage } from "dbRequests/websocket";
import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { useWebsocketRooms } from "models/websocket";
import { initializeChildParams } from "thunks/initializeParam";
import { addSectionAtPosition } from "thunks/sections/addSectionAtPosition";
import { updateManyCurrChildren } from "thunks/sections/children";
import { getSectionTypeConfig } from "thunks/sections/getters";
import {
  updateManyParamsAndCallables,
  updateParams,
} from "thunks/sections/sectionContents";
import { moveSections } from "thunks/sections/sectionOps";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { PANEID, REACT_FLOW_STORE } from "utils/constants";
import {
  DECK,
  GLOBAL_VARIABLES,
  SCRIPT,
  SWITCH_UI_TYPE_ID,
} from "z_utils/constants";
import { newCodeInfo } from "z_utils/objs/codeInfo";
import { newSectionPosition } from "z_utils/objs/sectionPosition";
import { RCType } from "z_utils/types/codeInfo";
import { createNewId } from "z_utils/utils";

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
    type: DECK,
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
  type,
  x,
  y,
  callbackBeforeExit,
  projectXY,
  incrementVersion,
  inputSectionProps = {},
}) {
  // see https://reactflow.dev/docs/examples/interaction/drag-and-drop/
  const topLevelPosition = projectXY
    ? REACT_FLOW_STORE.rf.screenToFlowPosition({ x, y })
    : newSectionPosition({ x, y });

  topLevelPosition.zIndex = 0;

  return addSectionAtPosition({
    type,
    topLevelPosition,
    callbackBeforeExit,
    incrementVersion,
    inputSectionProps,
  });
}

export function loadSectionIntoState({
  sections,
  uiTypes,
  evCols,
  uiTypeCols,
  codeInfo,
  relativePositions,
  topLevelIds,
  x,
  y,
  callbackBeforeExit,
  incrementVersion,
}) {
  const topLevelMapping = {};
  for (const i of topLevelIds) {
    topLevelMapping[i] = {
      x: x + relativePositions[i].x,
      y: y + relativePositions[i].y,
      zIndex: relativePositions[i].zIndex,
    };
  }

  useUITypes.getState().update(uiTypes);
  useParamInfos.getState().update({ evCols, uiTypeCols });
  useCodeInfo.getState().update(codeInfo);
  useSectionInfos.getState().update(sections);
  updateManyParamsAndCallables(Object.keys(sections));
  updateManyCurrChildren(Object.keys(sections));
  useProjectConfig.getState().addChildren(topLevelMapping);

  if (callbackBeforeExit) {
    callbackBeforeExit();
  }
  maybeIncrementProjectStateVersion(incrementVersion);
}

export function extractArgparseArgs({ pathToScript, ...props }) {
  const id = createNewId();
  const unsub = useWebsocketRooms.subscribe(
    (x) => x[id],
    (x) => {
      createSectionsFromArgparse({ pathToScript, args: x, ...props });
      unsub();
      useWebsocketRooms.getState().deleteRoom(id);
    }
  );
  sendMessage({
    id,
    messageType: "extractArgparseArgs",
    message: pathToScript,
  });
}

function createSectionsFromArgparse({ pathToScript, args, ...props }) {
  const varSectionId = onClickAddSection({
    type: GLOBAL_VARIABLES,
    ...props,
    incrementVersion: false,
  });

  const sectionCodeInfoId = getSectionTypeConfig(varSectionId).codeInfoId;

  const paramIdToUITypeId = {};
  for (const arg of args) {
    const info = newCodeInfo({
      name: arg.name,
      rcType: RCType.PARAMETER,
      editable: true,
    });
    useCodeInfo.getState().addCodeInfo({ info, parent: sectionCodeInfoId });
    if (arg.type === "store_true") {
      paramIdToUITypeId[info.id] = SWITCH_UI_TYPE_ID;
    }
  }

  initializeChildParams({
    sectionIds: [varSectionId],
    codeInfoIds: [sectionCodeInfoId],
    inputParamIdToUITypeId: paramIdToUITypeId,
  });
  updateParams(varSectionId);

  onClickAddSection({
    type: SCRIPT,
    ...props,
    x: props.x + 600,
    incrementVersion: false,
    inputSectionProps: {
      script: `python ${pathToScript} {{ RUNCODER_PYTHON_ARGPARSE }}`,
    },
  });
}
