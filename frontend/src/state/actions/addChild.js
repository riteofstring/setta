import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { insertIntoArray } from "utils/utils";
import { getSectionInfo, getSectionParentId } from "../getters/sectionInfo";
import { setAllChildren } from "./children";
import { createChildForSeries } from "./createSectionInfo";
import { updateManyParamsAndCallables } from "./sectionContents";

export function addChildrenToSeries({
  isRoot,
  calledBy,
  numChildren,
  incrementVersion = false,
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
