import C from "constants/constants.json";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { addSectionAtPosition } from "state/actions/createSection";
import { initializeChildParams } from "state/actions/initializeParam";
import { addNodes } from "state/actions/nodeInternals";
import {
  updateManyParamsAndCallables,
  updateParams,
} from "state/actions/sectionContents";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { sendMessageInRoom } from "state/actions/websocketRooms";
import { getSectionTypeConfig } from "state/getters/sectionInfo";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { newCodeInfo } from "utils/objs/codeInfo";
import { newSectionPosition } from "utils/objs/sectionPosition";
import { addCodeInfo, addCodeInfoBatch } from "./codeInfo";
import { updateEVCols } from "./evCols";
import { updateSections } from "./sectionInfos";
import { updateUITypeCols } from "./uiTypeCols";
import { updateUITypes } from "./uiTypes";

export function onClickAddSection({
  type,
  x,
  y,
  projectXY,
  incrementVersion,
  inputSectionProps = {},
}) {
  const position = projectXY
    ? screenToFlowPosition({ x, y })
    : newSectionPosition({ x, y });

  return addSectionAtPosition({
    type,
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

  updateUITypes(uiTypes);
  updateEVCols({ evCols });
  updateUITypeCols({ uiTypeCols });
  addCodeInfoBatch(codeInfo);
  updateSections(sections);
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
    addCodeInfo({ info, parent: sectionCodeInfoId });
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
      script: `python ${pathToScript} {{ SETTA_PYTHON_ARGPARSE }}`,
    },
  });
}
