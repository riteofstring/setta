import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { insertIntoArray } from "utils/utils";
import { setAllChildren } from "./children";
import { createChildForSeries } from "./createSectionInfo";
import { getSectionInfo, getSectionParentId } from "./getters";
import { updateManyParamsAndCallables } from "./sectionContents";

export function addChildrenToSeries({
  isRoot,
  calledBy,
  numChildren,
  incrementVersion = false,
}: {
  isRoot: boolean;
  calledBy: string;
  numChildren: number;
  incrementVersion?: boolean;
}) {
  let parentId, startIdx;
  if (isRoot) {
    parentId = calledBy;
    startIdx = 0;
  } else {
    parentId = getSectionParentId(calledBy);
    startIdx = getSectionInfo(parentId).children.indexOf(calledBy) + 1;
  }

  const newIds = createChildForSeries({
    parentId,
    numChildren,
  });

  setAllChildren(parentId, (x) => insertIntoArray(x, startIdx, ...newIds));
  updateManyParamsAndCallables(newIds);
  maybeIncrementProjectStateVersion(incrementVersion);

  return newIds;
}
