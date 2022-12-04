import { thunk } from "easy-peasy";
import { useEnteredValues } from "models/info/enteredValues";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionConfigs } from "models/info/sectionConfigs";
import { useSectionInfos } from "models/info/sectionInfos";
import { insertIntoArrayOrXpend } from "utils/utils";

function getNewStateFn(startId, newIds) {
  return (x) => {
    let insertIdx = null;
    if (startId !== null) {
      insertIdx = x.indexOf(startId) + 1;
    }
    return insertIntoArrayOrXpend(x, insertIdx, true, ...newIds);
  };
}

export const addChild = thunk((action, payload, helpers) => {
  const {
    parentId,
    name = null,
    uiTypeId,
    numChildren = 1,
    parentParamInfoId = null,
    startId = null,
  } = payload;
  const a = helpers.getStoreActions();

  const newIds = a.thunks.createChildSectionInfo({
    parentId,
    name,
    uiTypeId,
    numChildren,
    paramInfoId: parentParamInfoId,
  });

  const sectionInfosState = useSectionInfos.getState();

  sectionInfosState.setAllChildren({
    sectionId: parentId,
    newStateFn: getNewStateFn(startId, newIds),
  });

  if (parentParamInfoId) {
    const { configId } = sectionInfosState.x[parentId];
    const { evColId: collectionId } = useSectionConfigs.getState().x[configId];

    const enteredValueId =
      useParamInfos.getState().x[collectionId]?.[parentParamInfoId];

    useEnteredValues.getState().setChildId({
      enteredValueId,
      childId: newIds[0],
    });
  }
});
