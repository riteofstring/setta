import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { DEFAULT_SECTION_UI_TYPE_ID } from "../constants";
import { SectionType } from "../types/section";
import { SizeType } from "../types/size";
import { createVarName, maybeNewId } from "../utils";

export function newSectionInfo({
  id,
  name,
  children = [],
  size = { width: "auto", height: "auto" },
  position,
  zIndex = 0,
  parentId = null,
  uiTypeId = DEFAULT_SECTION_UI_TYPE_ID,
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
}: Partial<SectionType> & {
  size: SizeType;
}): SectionType {
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
    versionsHeight,
    versionsVisible,
    code,
    codeLanguage,
    evColIds: _evColIds,
    paramSweepIds,
    paramSweepSectionId,
    nonPresetUITypeIds,
    isFrozen,
  };
}
