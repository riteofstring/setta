import { action } from "easy-peasy";

import {
  MutableParamInfo,
  MutableParamUITypeInfo,
} from "../../classes/mutableInfo";
import { setToDefault, exportNestedState } from "./utils";

function setMutableParamInfo(state, collectionId, paramInfoId) {
  return setToDefault(
    state,
    collectionId,
    paramInfoId,
    () => new MutableParamInfo({ id: paramInfoId }),
    "x"
  );
}

function setMutableParamUITypeInfo(state, collectionId, paramInfoId) {
  return setToDefault(
    state,
    collectionId,
    paramInfoId,
    () => new MutableParamUITypeInfo({ id: paramInfoId }),
    "y"
  );
}

const paramInfos = {
  x: {},
  y: {},

  setUITypeId: action((state, payload) => {
    const { collectionId, paramInfoId, uiTypeId } = payload;
    setMutableParamUITypeInfo(state, collectionId, paramInfoId).uiTypeId =
      uiTypeId;
  }),

  setEnteredValueId: action((state, payload) => {
    const { collectionId, paramInfoId, enteredValueId } = payload;
    setMutableParamInfo(state, collectionId, paramInfoId).enteredValueId =
      enteredValueId;
  }),

  setChildId: action((state, payload) => {
    const { collectionId, paramInfoId, childId } = payload;
    setMutableParamInfo(state, collectionId, paramInfoId).childId = childId;
  }),

  deleteParamInfo: action((state, payload) => {
    const { paramCollectionId, uiTypeCollectionId, ids } = payload;
    state.x[paramCollectionId] = _.omit(state.x[paramCollectionId], ids);
    state.y[uiTypeCollectionId] = _.omit(state.y[uiTypeCollectionId], ids);
  }),

  export() {
    return exportNestedState(this);
  },
};

export default paramInfos;
