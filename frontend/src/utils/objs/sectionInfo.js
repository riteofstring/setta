import _ from "lodash";
import { useSectionInfos } from "state/definitions";
import { BASE_UI_TYPE_IDS } from "utils/constants";
import { createVarName, maybeNewId } from "../idNameCreation";

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
  const existingVarNames = _.map(useSectionInfos.getState().x, (s) => s.name);
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
