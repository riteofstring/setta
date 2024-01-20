import { getSectionInfo, getSectionParentId } from "./getters";
import { deleteSections } from "./sectionOps";

export function deleteChildrenFromSeries({
  calledBy,
  numChildren = 1,
  incrementVersion = false,
}: DeleteChildFnType) {
  const { children } = getSectionInfo(calledBy);
  if (children.length > 0) {
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

// if sectionId is null, then startId must be specified
type DeleteChildFnType = {
  calledBy: string;
  numChildren?: number;
  incrementVersion?: boolean;
};
