import { DEFAULT_SECTION_UI_TYPE_ID } from "../constants";
import { SectionType } from "../types/section";
import { SizeType } from "../types/size";
import { maybeNewId } from "../utils";

export function newSectionInfo({
  id,
  name = "New Section",
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
}: Partial<SectionType> & {
  size: SizeType;
}): SectionType {
  return {
    id: maybeNewId(id),
    name,
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
    nonPresetUITypeIds,
  };
}
