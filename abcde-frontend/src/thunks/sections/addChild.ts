import { useSectionInfos } from "models/info/sectionInfos";
import { setParamChildId } from "thunks/paramInfos";
import { insertIntoArrayOrXpend } from "utils/utils";
import { createChildSectionInfo } from "./createSectionInfo";

function getNewStateFn(startId: string | null, newIds: string[]) {
  return (x) => {
    let insertIdx = null;
    if (startId !== null) {
      insertIdx = x.indexOf(startId) + 1;
    }
    return insertIntoArrayOrXpend(x, insertIdx, true, ...newIds);
  };
}

export function addChildViaIncrementer({
  parentId,
  numChildren,
  startId = null,
}: {
  parentId: string;
  numChildren: number;
  startId: string | null;
}) {
  const newIds = createChildSectionInfo({
    parentId,
    numChildren,
  });

  useSectionInfos.getState().setAllChildren({
    sectionId: parentId,
    newStateFn: getNewStateFn(startId, newIds),
  });

  return newIds;
}

export function addChild({
  parentId,
  name = null,
  uiTypeId,
  numChildren = 1,
  parentParamInfoId = null,
  startId = null,
}: any) {
  const newIds = createChildSectionInfo({
    parentId,
    name,
    uiTypeId,
    numChildren,
    paramInfoId: parentParamInfoId,
  });

  useSectionInfos.getState().setAllChildren({
    sectionId: parentId,
    newStateFn: getNewStateFn(startId, newIds),
  });

  if (parentParamInfoId) {
    setParamChildId({
      sectionId: parentId,
      paramInfoId: parentParamInfoId,
      childId: newIds[0],
    });
  }

  return newIds;
}
