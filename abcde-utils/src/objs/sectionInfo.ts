import { SectionType } from "../types/section";
import { maybeNewId } from "../utils";

export function newSectionInfo({
  id,
  name,
  configId,
  sectionChildrenId,
  paramInfoId = null,
  initialPosition = { x: 0, y: 0 },
  parentId = null,
  parentName = "",
}: Partial<SectionType> & { parentName?: string }): SectionType {
  return {
    id: maybeNewId(id),
    name: name ? name : parentName,
    configId: maybeNewId(configId),
    sectionChildrenId: maybeNewId(sectionChildrenId),
    parentId,
    paramInfoId,
    initialPosition,
  };
}
