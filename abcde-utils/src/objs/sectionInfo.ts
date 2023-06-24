import { NULL_OBJ_ID } from "../constants";
import { SectionType } from "../types/section";
import { SizeType } from "../types/size";
import { maybeNewId } from "../utils";

export function newSectionInfo({
  id,
  name,
  children = [],
  currChildren = [],
  paramInfoId = null,
  size,
  initialPosition = { x: 0, y: 0 },
  parentId = null,
  parentName = "",
  chainedFrom = null,
  zIndex = 0,
  uiTypeId,
  evColId,
  kwargColId,
  uiTypeColId,
  selectedItem = NULL_OBJ_ID,
  social = null,
  outputGroup = null,
  userSpecifiedObjectId = null,
  description = "",
  descriptionHeight = 100,
  descriptionVisible = false,
  nonPresetUITypes = [],
}: Partial<SectionType> & {
  parentName?: string;
  size: SizeType;
}): SectionType {
  return {
    id: maybeNewId(id),
    name: name ? name : parentName,
    children,
    currChildren,
    parentId,
    paramInfoId,
    size,
    initialPosition,
    chainedFrom,
    zIndex,
    uiTypeId: maybeNewId(uiTypeId),
    evColId: maybeNewId(evColId),
    kwargColId: maybeNewId(kwargColId),
    uiTypeColId: maybeNewId(uiTypeColId),
    selectedItem,
    social,
    outputGroup,
    userSpecifiedObjectId,
    description,
    descriptionHeight,
    descriptionVisible,
    nonPresetUITypes,
  };
}
