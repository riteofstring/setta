import { useSectionInfos } from "models/info/sectionInfos";
import { setParamChildId } from "thunks/paramInfos";
import { insertIntoArrayOrXpend } from "utils/utils";
import {
  createChildForSeries,
  createManySectionInfo,
} from "./createSectionInfo";

function getNewStateFn(startId: string | null, newIds: string[]) {
  return (x) => {
    const insertIdx = startId !== null ? x.indexOf(startId) + 1 : null;
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

  useSectionInfos.getState().setAllChildren({
    sectionId: parentId,
    newStateFn: getNewStateFn(startId, newIds),
  });

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

  useSectionInfos.getState().setAllChildren({
    sectionId: parentId,
    newStateFn: getNewStateFn(null, [newId]),
  });

  setParamChildId({
    sectionId: parentId,
    paramInfoId,
    childId: newId,
  });

  return newId;
}
