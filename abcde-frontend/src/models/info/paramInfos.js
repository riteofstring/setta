import { MutableParamInfo, MutableParamUITypeInfo } from "classes/mutableInfo";
import { action, thunk } from "easy-peasy";
import _ from "lodash";

import { setToDefault } from "./utils";

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

  setManyUITypeIds: action((state, payload) => {
    const { collectionId, paramInfoIds, uiTypeIds } = payload;
    for (let z of _.zip(paramInfoIds, uiTypeIds)) {
      setMutableParamUITypeInfo(state, collectionId, z[0]).uiTypeId = z[1];
    }
  }),

  overrideUITypeIds: thunk((action, payload, helpers) => {
    const uiTypes = helpers.getStoreState().uiTypes.x;
    action.overrideUITypeIdsHelper({ ...payload, uiTypes });
  }),

  overrideUITypeIdsHelper: action((state, payload) => {
    const { toUITypeId, overrideLevel, uiTypes } = payload;
    for (let v of Object.values(state.y)) {
      for (let id of Object.keys(v)) {
        const newUITypeId = toUITypeId[id]?.uiTypeId;
        const currUIType = uiTypes[v[id].uiTypeId];
        if (newUITypeId && currUIType.origin <= overrideLevel) {
          v[id].uiTypeId = newUITypeId;
        }
      }
    }
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
    const { paramCollectionId, uiTypeColId, ids } = payload;
    state.x[paramCollectionId] = _.omit(state.x[paramCollectionId], ids);
    state.y[uiTypeColId] = _.omit(state.y[uiTypeColId], ids);
  }),

  export() {
    return { paramCollections: this.x, uiTypeCollections: this.y };
  },
};

export default paramInfos;
