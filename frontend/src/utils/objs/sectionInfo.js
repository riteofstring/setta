import _ from "lodash";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { createVarName, maybeNewId } from "../idNameCreation";
import { useSettings } from "state/definitions/settings";

export function newSectionInfo({
  id,
  name,
  children = [],
  size = { width: "auto", height: "auto" },
  position,
  zIndex = 0,
  parentId = null,
  uiTypeId = BASE_UI_TYPE_IDS.SECTION,
  evColId,
  uiTypeColId,
  paramSweepId = null,
  selectedItem = null,
  social = null,
  outputGroup = null,
  description = "",
  versionsHeight = "auto",
  versionsVisible = false,
  evColIds = [],
  paramSweepIds = [],
  paramSweepSectionId = null,
  nonPresetUITypeIds = [],
  code = "",
  codeLanguage = "",
  isFrozen = false,
  dbSource = "",
  isHorizontalOrientation = false,
}) {
  const _evColId = maybeNewId(evColId);
  const _evColIds = [...evColIds, _evColId];

  return {
    id: maybeNewId(id),
    name: name ? name : createVarName(existingVarNames),
    children,
    size,
    position,
    zIndex,
    parentId,
    uiTypeId: maybeNewId(uiTypeId),
    evColId: _evColId,
    uiTypeColId: maybeNewId(uiTypeColId),
    paramSweepId,
    selectedItem,
    social,
    outputGroup,
    description,
    versionsHeight,
    versionsVisible,
    code,
    codeLanguage,
    evColIds: _evColIds,
    paramSweepIds,
    paramSweepSectionId,
    nonPresetUITypeIds,
    isFrozen,
    dbSource,
    isHorizontalOrientation,
  };
}

export function getInitialSectionName(sectionType) {
  switch (sectionType) {
    case C.GLOBAL_VARIABLES:
    case C.VAR_CONTROL_NAME:
    case C.GLOBAL_PARAM_SWEEP:
      return U[sectionType];
    case C.INFO:
      return getInitialInfoTitle()
    default:
      const existingVarNames = _.map(
        useSectionInfos.getState().x,
        (s) => s.name,
      );
      return createVarName(existingVarNames);
  }
}


export function getInitialInfoTitle() {
  return "Empty Info Section";
}


export function getInitialSectionSize(){
  const settings = useSettings.getState();
  sectionProps.size = settings.defaultSectionSize;

} else if (type === C.CODE) {
  sectionProps.size = settings.defaultCodeSectionSize;
} else if (type === C.VAR_CONTROL) {
  sectionProps.size = settings.defaultCodeSectionSize;
} else if (type === C.TERMINAL) {
  sectionProps.size = settings.defaultTerminalSectionSize;
}
}