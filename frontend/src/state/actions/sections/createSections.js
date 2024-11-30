import { getDefaultInfoTitle } from "components/Panes/UiEditor/MarkdownEditor/MarkdownEditor";
import C from "constants/constants.json";
import { screenToFlowPosition } from "forks/xyflow/core/hooks/useViewportHelper";
import { useReactFlow } from "forks/xyflow/core/store";
import _ from "lodash";
import { addNodes } from "state/actions/nodeInternals";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import {
  useNodeInternals,
  useSectionInfos,
  useSettings,
} from "state/definitions";
import { localStorageFns } from "state/hooks/localStorage";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { createNewId } from "utils/idNameCreation";
import { newCodeInfoCol } from "utils/objs/codeInfoCol";
import { newSectionInfo } from "utils/objs/sectionInfo";
import { newSectionVariant } from "utils/objs/sectionVariant";
import { insertIntoArray } from "utils/utils";
import { getSectionInfo, getSectionParentId } from "../../getters/sectionInfo";
import { initRunGroup } from "../runGroups/runGroups";
import {
  getSectionChildren,
  setSectionVariantChildren,
} from "../sectionVariants";

export function addRegularSectionInEmptySpace() {
  return addSectionInEmptySpace({ type: C.SECTION });
}

export function addGroupInEmptySpace() {
  return addSectionInEmptySpace({ type: C.DECK });
}

export function addTerminalInEmptySpace() {
  return addSectionInEmptySpace({ type: C.TERMINAL });
}

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

  if (!sectionProps.size) {
    sectionProps.size = getDefaultSectionSize(type);
  }

  if (!sectionProps.name) {
    sectionProps.name = getDefaultSectionName(type);
  }

  if (type === C.DRAW) {
    sectionProps.canvasSettings = {
      color: "#ff0000",
      opacity: 1,
      brushSize: 16,
      brushShape: "round",
      canvasOpacity: 0.5,
      eraserBrushSize: 16,
    };
  }

  sectionProps.uiTypeId = BASE_UI_TYPE_IDS[type];

  const [newId] = createSectionInfo({ sectionProps, position });
  maybeIncrementProjectStateVersion(incrementVersion);
  return newId;
}

function getDefaultSectionSize(type) {
  const settings = useSettings.getState();
  switch (type) {
    case C.CODE:
      return settings.defaultCodeSectionSize;
    case C.TERMINAL:
      return settings.defaultTerminalSectionSize;
    default:
      return settings.defaultSectionSize;
  }
}

function getDefaultSectionName(type) {
  switch (type) {
    case C.INFO:
      return getDefaultInfoTitle();
    case C.GLOBAL_VARIABLES:
      return "Global Variables";
    case C.GLOBAL_PARAM_SWEEP:
      return "Global Param Sweep";
    default:
      return null;
  }
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
    startIdx = getSectionChildren(parentId).indexOf(calledBy) + 1;
  }

  const newIds = createSectionInfo({
    sectionProps: {
      parentId,
      size: { height: "auto", width: getSectionInfo(parentId).size.width },
    },
    numSections: numChildren,
  });

  setSectionVariantChildren({
    sectionId: parentId,
    newStateFn: (x) => insertIntoArray(x, startIdx, ...newIds),
  });

  maybeIncrementProjectStateVersion(incrementVersion);

  return newIds;
}

export function addChild({ id, parentId, type, sectionProps }) {
  createSectionInfo({
    sectionProps: {
      id,
      parentId,
      uiTypeId: BASE_UI_TYPE_IDS[type],
      ...sectionProps,
    },
  });
  setSectionVariantChildren({
    sectionId: parentId,
    newStateFn: (x) => [...x, id],
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
  const sectionIds = _.map(sectionInfos, (x) => x.id);

  useSectionInfos.setState((x) => {
    for (const s of Object.values(sectionInfos)) {
      const codeInfoColId = createNewId();
      x.codeInfoCols[codeInfoColId] = newCodeInfoCol();
      x.variants[s.variantId] = newSectionVariant({ codeInfoColId });
      x.uiTypeCols[s.uiTypeColId] = {};
      x.x[s.id] = s;
      if (x.uiTypes[s.uiTypeId].type === C.GLOBAL_PARAM_SWEEP) {
        initRunGroup(s.variantId, x);
      }
    }
  });

  const topLevelSectionIds = [];

  for (const s of sectionIds) {
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
    : {
        x: x ?? 0,
        y: y ?? 0,
        zIndex: zIndex ?? 0,
      };

  return addSectionAtPosition({
    type,
    incrementVersion,
    inputSectionProps,
    position,
  });
}
