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
    const { collectionId, ids } = payload;
    state.x[collectionId] = _.omit(state.x[collectionId], ids);
  }),

  deleteParamUITypeInfo: action((state, payload) => {
    const { collectionId, ids } = payload;
    state.y[collectionId] = _.omit(state.y[collectionId], ids);
  }),

  export() {
    return exportNestedState(this);
  },
};

export default paramInfos;
