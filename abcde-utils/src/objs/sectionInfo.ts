import { SectionInfoType } from "../types/sectionInfo";
import { maybeNewId } from "../utils";

export function newSectionInfo({
  name,
  configId,
  sectionChildrenId,
  paramInfoId = null,
  initialPosition = { x: 0, y: 0 },
  parentId = null,
  parentName = "",
}: Partial<SectionInfoType> & { parentName?: string }): SectionInfoType {
  return {
    name: name ? name : parentName,
    configId: maybeNewId(configId),
    sectionChildrenId: maybeNewId(sectionChildrenId),
    parentId,
    paramInfoId,
    initialPosition,
  };
}
