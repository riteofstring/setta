import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { insertIntoArrayOrXpend } from "utils/utils";
import { setAllChildren } from "./children";
import { createChildForSeries, createSectionInfo } from "./createSectionInfo";
import { updateManyParamsAndCallables } from "./sectionContents";

function getNewStateFn(startId: string | null, newIds: string[]) {
  return (x) => {
    let insertIdx = null;
    if (startId !== null) {
      insertIdx = x.indexOf(startId) + 1;
    }
    return insertIntoArrayOrXpend(x, insertIdx, true, ...newIds);
  };
}

export function addChildForSeries({
  parentId,
  numChildren,
  startId = null,
  incrementVersion = false,
}: {
  parentId: string;
  numChildren: number;
  startId: string | null;
  incrementVersion?: boolean;
}) {
  const newIds = createChildForSeries({
    parentId,
    numChildren,
  });

  setAllChildren(parentId, getNewStateFn(startId, newIds));
  updateManyParamsAndCallables(newIds);
  maybeIncrementProjectStateVersion(incrementVersion);

  return newIds;
}

export function addChildForParam({
  parentId,
  name,
  uiTypeId,
  paramInfoId,
}: any) {
  const newId = createSectionInfo({
    sectionProps: { name, parentId, paramInfoId, uiTypeId },
    numSections: 1,
  })[0];

  setAllChildren(parentId, getNewStateFn(null, [newId]));
  updateManyParamsAndCallables([newId]);

  return newId;
}
