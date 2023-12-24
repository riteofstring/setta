import { DEFAULT_SECTION_UI_TYPE_ID } from "../constants";
import { SectionType } from "../types/section";
import { SizeType } from "../types/size";
import { createVarName, maybeNewId } from "../utils";

export function newSectionInfo({
  id,
  name,
  children = [],
  currChildren = [],
  paramInfoId = null,
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
  nonPresetUITypeIds = [],
  script = "",
  code = "",
  existingVarNames,
}: Partial<SectionType> & {
  size: SizeType;
  existingVarNames: string[];
}): SectionType {
  return {
    id: maybeNewId(id),
    name: name ? name : createVarName(existingVarNames),
    children,
    currChildren,
    parentId,
    paramInfoId,
    size,
    chainedFrom,
    uiTypeId: maybeNewId(uiTypeId),
    evColId: maybeNewId(evColId),
    uiTypeColId: maybeNewId(uiTypeColId),
    selectedItem,
    social,
    outputGroup,
    description,
    descriptionHeight,
    descriptionVisible,
    script,
    code,
    nonPresetUITypeIds,
  };
}
