import C from "constants/constants.json";
import { sendMessageInRoom } from "hooks/useWebsocket";
import { useCodeInfo } from "models/info/codeInfo";
import { addNodes } from "models/info/nodeInternals";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { initializeChildParams } from "thunks/initializeParam";
import { addSectionAtPosition } from "thunks/sections/addSectionAtPosition";
import { getSectionTypeConfig } from "thunks/sections/getters";
import {
  updateManyParamsAndCallables,
  updateParams,
} from "thunks/sections/sectionContents";
import { moveSections } from "thunks/sections/sectionOps";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { BASE_UI_TYPE_IDS, PANEID } from "utils/constants";
import { screenToFlowPosition } from "xyflow/core/hooks/useViewportHelper";
import { newCodeInfo } from "z_utils/objs/codeInfo";
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
    type: C.DECK,
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
  const position = projectXY
    ? screenToFlowPosition({ x, y })
    : newSectionPosition({ x, y });

  return addSectionAtPosition({
    type,
    callbackBeforeExit,
    incrementVersion,
    inputSectionProps,
    position,
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
  const nodes = [];
  for (const [id, n] of Object.entries(topLevelMapping)) {
    nodes.push({
      id,
      position: { x: n.x, y: n.y },
      zIndex: n.zIndex,
      tempZIndex: n.zIndex,
    });
  }
  addNodes(nodes);

  if (callbackBeforeExit) {
    callbackBeforeExit();
  }
  maybeIncrementProjectStateVersion(incrementVersion);
}

export async function extractArgparseArgs({ pathToScript, ...props }) {
  const args = await sendMessageInRoom({
    messageType: "extractArgparseArgs",
    content: pathToScript,
  });
  createSectionsFromArgparse({ pathToScript, args, ...props });
}

function createSectionsFromArgparse({ pathToScript, args, ...props }) {
  const varSectionId = onClickAddSection({
    type: C.GLOBAL_VARIABLES,
    ...props,
    incrementVersion: false,
  });

  const sectionCodeInfoId = getSectionTypeConfig(varSectionId).codeInfoId;

  const paramIdToUITypeId = {};
  for (const arg of args) {
    const info = newCodeInfo({
      name: arg.name,
      rcType: C.PARAMETER,
      editable: true,
    });
    useCodeInfo.getState().addCodeInfo({ info, parent: sectionCodeInfoId });
    if (arg.type === "store_true") {
      paramIdToUITypeId[info.id] = BASE_UI_TYPE_IDS.SWITCH;
    }
  }

  initializeChildParams({
    sectionIds: [varSectionId],
    codeInfoIds: [sectionCodeInfoId],
    inputParamIdToUITypeId: paramIdToUITypeId,
  });
  updateParams(varSectionId);

  onClickAddSection({
    type: C.CODE,
    ...props,
    x: props.x + 600,
    incrementVersion: false,
    inputSectionProps: {
      script: `python ${pathToScript} {{ RUNCODER_PYTHON_ARGPARSE }}`,
    },
  });
}
