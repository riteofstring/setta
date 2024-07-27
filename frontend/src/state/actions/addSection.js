import { getDefaultInfoTitle } from "components/AppContainer/Main/UiEditorContainer/SidePanes/UiEditor/MarkdownEditor/MarkdownEditor";
import C from "constants/constants.json";
import { useReactFlow } from "forks/xyflow/core/store";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSettings } from "state/definitions/settings";
import { localStorageFns } from "state/hooks/localStorageHooks";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { insertIntoArray } from "utils/utils";
import { getSectionInfo, getSectionParentId } from "../getters/sectionInfo";
import { setAllChildren } from "./children";
import { createChildForSeries, createSectionInfo } from "./createSectionInfo";
import { updateManyParamsAndCallables } from "./sectionContents";

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
  callbackBeforeExit = () => undefined,
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
  callbackBeforeExit(newId);
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

  setAllChildren(parentId, (x) => insertIntoArray(x, startIdx, ...newIds));
  updateManyParamsAndCallables(newIds);
  maybeIncrementProjectStateVersion(incrementVersion);

  return newIds;
}
