import { getSectionInfo, getSectionParentId } from "../../getters/sectionInfo";
import { deleteSections } from "../sectionOps";

export function deleteChildrenFromSeries({
  isRoot,
  calledBy,
  numChildren = 1,
  incrementVersion = false,
}) {
  if (isRoot) {
    const { children } = getSectionInfo(calledBy);
    deleteSections({
      sectionIds: children.slice(0, numChildren),
      incrementVersion,
    });
  } else {
    const parentId = getSectionParentId(calledBy);
    const { children: siblings } = getSectionInfo(parentId);
    const startIdx = siblings.indexOf(calledBy) + 1;
    deleteSections({
      sectionIds: siblings.slice(startIdx, startIdx + numChildren),
      incrementVersion,
    });
  }
}
