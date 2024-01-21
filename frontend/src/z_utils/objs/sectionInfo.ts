import { DEFAULT_SECTION_UI_TYPE_ID } from "../constants";
import { SectionType } from "../types/section";
import { SizeType } from "../types/size";
import { createVarName, maybeNewId } from "../utils";

export function newSectionInfo({
  id,
  name,
  children = [],
  size,
  parentId = null,
  chainedFrom = null,
  uiTypeId = DEFAULT_SECTION_UI_TYPE_ID,
  evColId,
  uiTypeColId,
  paramSweepId = null,
  selectedItem = null,
  social = null,
  outputGroup = null,
  description = "",
  descriptionHeight = 100,
  descriptionVisible = false,
  evColIds = [],
  paramSweepIds = [],
  paramSweepFor = null,
  nonPresetUITypeIds = [],
  script = "",
  code = "",
  varControl = "",
  existingVarNames,
  isFrozen = false,
}: Partial<SectionType> & {
  size: SizeType;
  existingVarNames: string[];
}): SectionType {
  const _evColId = maybeNewId(evColId);
  const _evColIds = [...evColIds, _evColId];

  return {
    id: maybeNewId(id),
    name: name ? name : createVarName(existingVarNames),
    children,
    size,
    parentId,
    chainedFrom,
    uiTypeId: maybeNewId(uiTypeId),
    evColId: _evColId,
    uiTypeColId: maybeNewId(uiTypeColId),
    paramSweepId,
    selectedItem,
    social,
    outputGroup,
    description,
    descriptionHeight,
    descriptionVisible,
    script,
    code,
    varControl,
    evColIds: _evColIds,
    paramSweepIds,
    paramSweepFor,
    nonPresetUITypeIds,
    isFrozen,
  };
}
