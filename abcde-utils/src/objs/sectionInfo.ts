import { SectionType } from "../types/section";
import { SizeType } from "../types/size";
import { maybeNewId } from "../utils";

export function newSectionInfo({
  id,
  name,
  configId,
  sectionChildrenId,
  paramInfoId = null,
  size,
  initialPosition = { x: 0, y: 0 },
  parentId = null,
  parentName = "",
  chainedFrom = null,
  zIndex = 0,
}: Partial<SectionType> & {
  parentName?: string;
  size: SizeType;
}): SectionType {
  return {
    id: maybeNewId(id),
    name: name ? name : parentName,
    configId: maybeNewId(configId),
    sectionChildrenId: maybeNewId(sectionChildrenId),
    parentId,
    paramInfoId,
    size,
    initialPosition,
    chainedFrom,
    zIndex,
  };
}
