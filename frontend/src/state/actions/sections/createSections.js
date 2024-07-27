import { getDefaultInfoTitle } from "components/ProjectPage/UiEditor/MarkdownEditor/MarkdownEditor";
import C from "constants/constants.json";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { initializeChildParams } from "state/actions/initializeParam";
import { addNodes } from "state/actions/nodeInternals";
import { updateParams } from "state/actions/sections/sectionContents";
import { setSectionChildrenAndNames } from "state/actions/sections/setters";
import { getChildUIType } from "state/actions/uiTypes/getChildUITypeId";
import { setSectionUITypeConfig } from "state/actions/uiTypes/setSectionUITypeConfig";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useNodeInternals, useSettings } from "state/definitions";
import { localStorageFns } from "state/hooks/localStorage";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { newCodeInfo } from "utils/objs/codeInfo";
import { newSectionInfo } from "utils/objs/sectionInfo";
import { newSectionPosition } from "utils/objs/sectionPosition";
import { insertIntoArray } from "utils/utils";
import {
  getSectionInfo,
  getSectionParentId,
  getSectionType,
  getSectionTypeConfig,
} from "../../getters/sectionInfo";
import { addCodeInfo } from "../codeInfo";
import { initManyEvColIds } from "../evCols";
import { initManyUITypeColIds } from "../uiTypes/uiTypeCols";
import { updateManyParamsAndCallables } from "./sectionContents";
import { addSectionInfo } from "./sectionInfos";

export function addSectionInEmptySpace({
  type,
  inputSectionProps = {},
  positionOffset = { x: 0, y: 0 },
}) {
  const {
    transform: [_x, _y, zoom],
  } = useReactFlow.getState();
  const [overviewWidth] = localStorageFns.overviewTrueWidth.state();

  const x = (overviewWidth - _x) / zoom;
  const y = -_y / zoom;

  const position = { x: x + positionOffset.x, y: y + positionOffset.y };

  return addSectionAtPosition({
    type,
    inputSectionProps,
    position,
    incrementVersion: true,
  });
}

export function addSectionAtPosition({
  type,
  incrementVersion = false,
  inputSectionProps = {},
  position,
}) {
  const sectionProps = {
    ...inputSectionProps,
  };

  const settings = useSettings.getState();
  sectionProps.size = settings.defaultSectionSize;
  if (type === C.DECK) {
  } else if (type === C.GLOBAL_VARIABLES) {
    sectionProps.name = "Global Variables";
  } else if (type === C.CODE) {
    sectionProps.name = "Code";
    sectionProps.size = settings.defaultCodeSectionSize;
  } else if (type === C.VAR_CONTROL) {
    sectionProps.name = "Var Control";
    sectionProps.size = settings.defaultCodeSectionSize;
  } else if (type === C.TERMINAL) {
    sectionProps.size = settings.defaultTerminalSectionSize;
  } else if (type === C.GLOBAL_PARAM_SWEEP) {
    sectionProps.name = "Global Param Sweep";
  } else if (type === C.INFO) {
    sectionProps.name = getDefaultInfoTitle();
  }

  sectionProps.uiTypeId = BASE_UI_TYPE_IDS[type];

  const [newId] = createSectionInfo({ sectionProps, position });
  maybeIncrementProjectStateVersion(incrementVersion);
  return newId;
}

export function addChildrenToSeries({
  isRoot,
  calledBy,
  numChildren,
  incrementVersion = false,
}) {
  let parentId, startIdx;
  if (isRoot) {
    parentId = calledBy;
    startIdx = 0;
  } else {
    parentId = getSectionParentId(calledBy);
    startIdx = getSectionInfo(parentId).children.indexOf(calledBy) + 1;
  }

  const newIds = createChildForSeries({
    parentId,
    numChildren,
  });

  setSectionChildrenAndNames(parentId, (x) =>
    insertIntoArray(x, startIdx, ...newIds),
  );
  updateManyParamsAndCallables(newIds);
  maybeIncrementProjectStateVersion(incrementVersion);

  return newIds;
}

export function createChildForSeries({ parentId, numChildren }) {
  // const { name: parentName } = useSectionInfos.getState().x[parentId];
  const parentUIType = getSectionType(parentId);
  const uiType = getChildUIType(parentUIType, parentId);
  const nonPresetUITypeIds = !uiType.presetType ? [uiType.id] : [];

  return createSectionInfo({
    sectionProps: {
      parentId,
      uiTypeId: uiType.id,
      nonPresetUITypeIds,
    },
    numSections: numChildren,
  });
}

export function createSectionInfo({
  sectionProps = {},
  numSections = 1,
  position,
}) {
  const newInfos = {};
  for (let i = 0; i < numSections; i++) {
    const sectionInfo = newSectionInfo(sectionProps);
    newInfos[sectionInfo.id] = sectionInfo;
  }
  addSectionsToState(newInfos, position);
  return Object.keys(newInfos);
}

function addSectionsToState(sectionInfos, position) {
  addSectionInfo((x) => ({ ...x, ...sectionInfos }));

  const sectionIds = _.map(sectionInfos, (x) => x.id);

  initManyEvColIds({
    dbSource: C.DEFAULT_DB_ALIAS,
    collectionIds: _.map(sectionInfos, (x) => x.evColId),
  });

  initManyUITypeColIds({
    collectionIds: _.map(sectionInfos, (x) => x.uiTypeColId),
  });

  const topLevelSectionIds = [];

  for (const s of sectionIds) {
    initializeNewSectionConfig(s);
    const { codeInfoId } = getSectionTypeConfig(s);
    initializeChildParams({ sectionIds: [s], codeInfoIds: [codeInfoId] });
    if (!sectionInfos[s].parentId) {
      topLevelSectionIds.push(s);
    }
  }

  if (topLevelSectionIds.length > 0) {
    addNodes(
      topLevelSectionIds.map((s) => ({
        id: s,
        position,
        zIndex: 0,
        tempZIndex: 0,
      })),
    );
  }
}

function initializeNewSectionConfig(sectionId) {
  const collection = newCodeInfo({
    name: "Contents",
    rcType: C.COLLECTION,
  });
  addCodeInfo({ info: collection });
  setSectionUITypeConfig({
    sectionId,
    configProps: {
      configName: "codeInfoId",
      newValueFn: () => collection.id,
    },
  });
}

export function createAdjacentSection(sectionId, sectionProps) {
  const { position: sectionPosition, width: sectionWidth } = useNodeInternals
    .getState()
    .x.get(sectionId);

  const position = {
    x: sectionPosition.x + sectionWidth,
    y: sectionPosition.y,
  };

  createSectionInfo({ sectionProps, position });
}

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

export function createSectionsFromArgparse({ pathToScript, args, ...props }) {
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
