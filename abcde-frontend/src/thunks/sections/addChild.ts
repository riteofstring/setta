import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { insertIntoArrayOrXpend } from "utils/utils";
import {
  createChildForSeries,
  createManySectionInfo,
} from "./createSectionInfo";
import { setAllChildren } from "./sections";

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

  maybeIncrementProjectStateVersion(incrementVersion);

  return newIds;
}

export function addChildForParam({
  parentId,
  name,
  uiTypeId,
  paramInfoId,
}: any) {
  const newId = createManySectionInfo({
    sectionProps: { name, parentId, paramInfoId, uiTypeId },
    numChildren: 1,
  })[0];

  setAllChildren(parentId, getNewStateFn(null, [newId]));

  return newId;
}
