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
  variantId,
  uiTypeId = BASE_UI_TYPE_IDS.SECTION,
  uiTypeColId,
  paramSweepId = null,
  selectedItem = null,
  social = null,
  outputGroup = null,
  description = "",
  versionsHeight = "auto",
  versionsVisible = false,
  variantIds = [],
  paramSweepIds = [],
  paramSweepSectionId = null,
  nonPresetUITypeIds = [],
  code = "",
  codeLanguage = "",
  isFrozen = false,
  dbSource = "",
  isHorizontalOrientation = false,
  hideParams = false,
  hideSearch = false,
}) {
  const existingVarNames = _.map(useSectionInfos.getState().x, (s) => s.name);
  const _variantId = maybeNewId(variantId);
  const _variantIds = [...variantIds, _variantId];

  return {
    id: maybeNewId(id),
    name: name ? name : createVarName(existingVarNames),
    children,
    size,
    position,
    zIndex,
    parentId,
    variantId: _variantId,
    uiTypeId: maybeNewId(uiTypeId),
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
    variantIds: _variantIds,
    paramSweepIds,
    paramSweepSectionId,
    nonPresetUITypeIds,
    isFrozen,
    dbSource,
    isHorizontalOrientation,
    hideParams,
    hideSearch,
  };
}
