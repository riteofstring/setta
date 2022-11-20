import { action, thunk } from "easy-peasy";
import _ from "lodash";
import { resetState } from "models/utils";
import { setToDefault } from "./utils";

function getInitialState() {
  return { x: {}, y: {} };
}

const paramInfos = {
  ...getInitialState(),

  resetAndSetAll: thunk((actions, payload) => {
    actions.reset();
    actions.setAll(payload);
  }),

  setAll: action((state, payload) => {
    state.x = payload.evCols;
    state.y = payload.uiTypeCols;
  }),

  setUITypeId: action((state, payload) => {
    const { collectionId, paramInfoId, uiTypeId } = payload;
    setToDefault(state.y, collectionId)[paramInfoId] = uiTypeId;
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
