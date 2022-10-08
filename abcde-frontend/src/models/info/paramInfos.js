import { action, computed, thunk } from "easy-peasy";
import _ from "lodash";
import memoizeOne from "memoize-one";
import { setToDefault } from "./utils";

const paramInfos = {
  x: {},
  y: {},

  setUITypeId: action((state, payload) => {
    const { collectionId, paramInfoId, uiTypeId } = payload;
    setToDefault(state.y, collectionId)[paramInfoId] = uiTypeId;
  }),

  setManyUITypeIds: action((state, payload) => {
    const { collectionId, paramInfoIds, uiTypeIds } = payload;
    for (let z of _.zip(paramInfoIds, uiTypeIds)) {
      setToDefault(state.y, collectionId)[z[0]] = z[1];
    }
  }),

  setEnteredValueId: action((state, payload) => {
    const { collectionId, paramInfoId, enteredValueId } = payload;
    setToDefault(state.x, collectionId)[paramInfoId] = enteredValueId;
  }),

  deleteParamInfo: action((state, payload) => {
    const { paramCollectionId, uiTypeColId, ids } = payload;
    state.x[paramCollectionId] = _.omit(state.x[paramCollectionId], ids);
    state.y[uiTypeColId] = _.omit(state.y[uiTypeColId], ids);
  }),

  childId: computed(
    [
      (state) => state.x,
      (state, storeState) => storeState.sectionInfos.sectionConfig,
      (state, storeState) => storeState.enteredValues.x,
    ],
    (x, sectionConfigFn, enteredValues) => {
      return memoizeOne((sectionId, paramInfoId) => {
        const paramCollectionId = sectionConfigFn(sectionId).paramCollectionId;
        const enteredValueId = x[paramCollectionId]?.[paramInfoId];
        return enteredValues[enteredValueId]?.childId;
      });
    }
  ),

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
};

export default paramInfos;
