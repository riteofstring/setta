import { action } from "easy-peasy";

import { MutableParamInfo } from "../../classes/mutableInfo";
import { setToDefault, exportNestedState } from "./utils";

function setDefaultInfo(state, collectionId, paramInfoId) {
  return setToDefault(
    state,
    collectionId,
    paramInfoId,
    () => new MutableParamInfo({ id: paramInfoId })
  );
}

const paramInfos = {
  x: {},

  setUITypeId: action((state, payload) => {
    const { collectionId, paramInfoId, uiTypeId } = payload;
    setDefaultInfo(state, collectionId, paramInfoId).uiTypeId = uiTypeId;
  }),

  setEnteredValueId: action((state, payload) => {
    const { collectionId, paramInfoId, enteredValueId } = payload;
    setDefaultInfo(state, collectionId, paramInfoId).enteredValueId =
      enteredValueId;
  }),

  setChildId: action((state, payload) => {
    const { collectionId, paramInfoId, childId } = payload;
    setDefaultInfo(state, collectionId, paramInfoId).childId = childId;
  }),

  deleteParamInfo: action((state, payload) => {
    const { collectionId, ids } = payload;
    state.x[collectionId] = _.omit(state.x[collectionId], ids);
  }),

  export() {
    return exportNestedState(this);
  },
};

export default paramInfos;
