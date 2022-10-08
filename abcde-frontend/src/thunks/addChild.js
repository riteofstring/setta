import { thunk } from "easy-peasy";
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

  const newIds = helpers.getStoreActions().thunks.createChildSectionInfo({
    parentId,
    name,
    uiTypeId,
    numChildren,
    paramInfoId: parentParamInfoId,
  });

  helpers.getStoreActions().sectionInfos.setIdsOverview({
    sectionId: parentId,
    newStateFn: getNewStateFn(startId, newIds),
  });

  if (parentParamInfoId) {
    const { configId } = helpers.getStoreState().sectionInfos.x[parentId];
    const { paramCollectionId: collectionId } =
      helpers.getStoreState().sectionConfigs.x[configId];

    const enteredValueId =
      helpers.getStoreState().paramInfos.x[collectionId]?.[parentParamInfoId];


    helpers.getStoreActions().enteredValues.setChildId({
      enteredValueId,
      childId: newIds[0],
    });
  }
});
