import { getDefaultInfoTitle } from "components/Panes/UiEditor/MarkdownEditor/MarkdownEditor";
import C from "constants/constants.json";
import { useReactFlow } from "forks/xyflow/core/store";
import { getSectionRect } from "forks/xyflow/core/utils/graph";
import { addNodes } from "state/actions/nodeInternals";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos, useSettings } from "state/definitions";
import { localStorageFns } from "state/hooks/localStorage";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { createNewId } from "utils/idNameCreation";
import { newCodeInfoCol } from "utils/objs/codeInfoCol";
import { newSectionInfo } from "utils/objs/sectionInfo";
import { newSectionVariant } from "utils/objs/sectionVariant";
import { insertIntoArray } from "utils/utils";
import { getSectionInfo } from "../../getters/sectionInfo";
import { initRunGroup } from "../runGroups/runGroups";
import { setSectionVariantChildren } from "../sectionVariants";

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

  useSectionInfos.setState((state) => {
    addSectionAtPosition({
      type,
      inputSectionProps,
      position,
      state,
    });
  });
}

export function addSectionAtPosition({
  type,
  inputSectionProps = {},
  position,
  state,
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

  const [newId] = createSectionInfo({ sectionProps, position, state });
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
  let newIds;
  useSectionInfos.setState((state) => {
    let parentId, startIdx;
    if (isRoot) {
      parentId = calledBy;
      startIdx = 0;
    } else {
      parentId = state.x[calledBy].parentId;
      startIdx =
        state.variants[state.x[parentId].variantId].children.indexOf(calledBy) +
        1;
    }

    newIds = createSectionInfo({
      sectionProps: {
        parentId,
        size: { height: "auto", width: getSectionInfo(parentId).size.width },
      },
      numSections: numChildren,
      state,
    });

    setSectionVariantChildren(
      parentId,
      (x) => insertIntoArray(x, startIdx, ...newIds),
      state,
    );
  });

  maybeIncrementProjectStateVersion(incrementVersion);

  return newIds;
}

export function addChild({ id, parentId, type, sectionProps }) {
  useSectionInfos.setState((state) => {
    createSectionInfo({
      sectionProps: {
        id,
        parentId,
        uiTypeId: BASE_UI_TYPE_IDS[type],
        ...sectionProps,
      },
      state,
    });
    setSectionVariantChildren(parentId, (x) => [...x, id], state);
  });
}

export function createSectionInfo({
  sectionProps = {},
  numSections = 1,
  position,
  state,
}) {
  const newInfos = {};
  for (let i = 0; i < numSections; i++) {
    const sectionInfo = newSectionInfo(sectionProps);
    newInfos[sectionInfo.id] = sectionInfo;
  }
  addSectionsToState(newInfos, position, state);
  return Object.keys(newInfos);
}

function addSectionsToState(sectionInfos, position, state) {
  for (const s of Object.values(sectionInfos)) {
    const codeInfoColId = createNewId();
    state.codeInfoCols[codeInfoColId] = newCodeInfoCol();
    state.variants[s.variantId] = newSectionVariant({ codeInfoColId });
    state.uiTypeCols[s.uiTypeColId] = {};
    state.x[s.id] = s;
    if (state.uiTypes[s.uiTypeId].type === C.GLOBAL_PARAM_SWEEP) {
      initRunGroup(s.variantId, state);
    }
  }

  const topLevelSectionIds = [];
  for (const s of Object.keys(sectionInfos)) {
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

export function createAdjacentSection(sectionId, sectionProps, state) {
  const { x, y, width } = getSectionRect(sectionId);

  const position = {
    x: x + width,
    y,
  };

  createSectionInfo({ sectionProps, position, state });
}
