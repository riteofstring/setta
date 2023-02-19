import { setParamChildId } from "thunks/paramInfos";
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
}: {
  parentId: string;
  numChildren: number;
  startId: string | null;
}) {
  const newIds = createChildForSeries({
    parentId,
    numChildren,
  });

  setAllChildren(parentId, getNewStateFn(startId, newIds));

  return newIds;
}

export function addChildForParam({
  parentId,
  name,
  uiTypeId,
  paramInfoId,
}: any) {
  const newId = createManySectionInfo({
    sectionProps: { name, parentId, paramInfoId },
    configProps: { uiTypeId },
    numChildren: 1,
  })[0];

  setAllChildren(parentId, getNewStateFn(null, [newId]));

  setParamChildId({
    sectionId: parentId,
    paramInfoId,
    childId: newId,
  });

  return newId;
}
