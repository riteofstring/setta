import {
  getSectionInfo,
  getSectionParentId,
} from "../../state/sectionInfos/getters";
import { deleteSections } from "./sectionOps";

export function deleteChildrenFromSeries({
  isRoot,
  calledBy,
  numChildren = 1,
  incrementVersion = false,
}: DeleteChildFnType) {
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

// if sectionId is null, then startId must be specified
type DeleteChildFnType = {
  isRoot: boolean;
  calledBy: string;
  numChildren?: number;
  incrementVersion?: boolean;
};
