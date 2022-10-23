import { action, thunk } from "easy-peasy";
import _ from "lodash";
import { resetState } from "models/utils";
import { setToDefault } from "./utils";

function getInitialState() {
  return { x: {}, y: {} };
}

const paramInfos = {
  ...getInitialState(),

  setAllUITypeIds: action((state, payload) => {
    state.y = payload;
  }),

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

  setAllEnteredValueIds: action((state, payload) => {
    state.x = payload;
  }),

  setEnteredValueId: action((state, payload) => {
    const { collectionId, paramInfoId, enteredValueId } = payload;
    setToDefault(state.x, collectionId)[paramInfoId] = enteredValueId;
  }),

  deleteParamInfo: action((state, payload) => {
    const { evColId, uiTypeColId, ids } = payload;
    state.x[evColId] = _.omit(state.x[evColId], ids);
    state.y[uiTypeColId] = _.omit(state.y[uiTypeColId], ids);
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default paramInfos;
