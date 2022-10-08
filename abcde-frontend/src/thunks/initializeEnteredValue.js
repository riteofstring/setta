import { thunk } from "easy-peasy";
import { createNewId, curryAction } from "utils/utils";

export const initializeEnteredValue = thunk((actions, payload, helpers) => {
  const { sectionId, paramInfo } = payload;
  const s = helpers.getStoreState();
  const configId = s.sectionInfos.x[sectionId].configId;
  const paramCollectionId = s.sectionConfigs.x[configId].paramCollectionId;
  const enteredValueId = s.paramInfos.x[paramCollectionId]?.[paramInfo.id];

  if (enteredValueId) {
    return;
  }

  const a = helpers.getStoreActions();

  const setEnteredValueId = curryAction(
    a.paramInfos.setEnteredValueId,
    {
      collectionId: paramCollectionId,
      paramInfoId: paramInfo.id,
    },
    "enteredValueId"
  );

  const newId = createNewId();
  setEnteredValueId(newId);
  a.enteredValues.setEnteredValue({ enteredValueId: newId, value: null });
});
