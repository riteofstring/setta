import { DEFAULT_SECTION_UI_TYPE_ID } from "../constants";
import { SectionType } from "../types/section";
import { SizeType } from "../types/size";
import { createVarName, maybeNewId } from "../utils";

export function newSectionInfo({
  id,
  name,
  children = [],
  currChildren = [],
  size,
  parentId = null,
  chainedFrom = null,
  uiTypeId = DEFAULT_SECTION_UI_TYPE_ID,
  evColId,
  uiTypeColId,
  selectedItem = null,
  social = null,
  outputGroup = null,
  description = "",
  descriptionHeight = 100,
  descriptionVisible = false,
  evColIds = [],
  nonPresetUITypeIds = [],
  script = "",
  code = "",
  varControl = "",
  existingVarNames,
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
    currChildren,
    parentId,
    size,
    chainedFrom,
    uiTypeId: maybeNewId(uiTypeId),
    evColId: _evColId,
    uiTypeColId: maybeNewId(uiTypeColId),
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
    nonPresetUITypeIds,
  };
}
