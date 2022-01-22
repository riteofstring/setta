import { action } from "easy-peasy";

import { exportState } from "./utils";

const uiTypes = {
  x: {},

  setUIType: action((state, payload) => {
    const { uiType } = payload;
    state.x[uiType.id] = uiType;
  }),

  setManyUITypes: action((state, payload) => {
    const { uiTypes } = payload;
    for (let u of uiTypes) {
      state.x[u.id] = u;
    }
  }),

  setType: action((state, payload) => {
    const { uiTypeId, type } = payload;
    state.x[uiTypeId].type = type;
  }),

  setOneConfig: action((state, payload) => {
    const { uiTypeId, configName, newValueFn } = payload;
    const curr = state.x[uiTypeId].config;
    curr[configName] = newValueFn(curr[configName]);
  }),

  deleteUIType: action((state, payload) => {
    const { uiTypeId } = payload;
    delete state.x[uiTypeId];
  }),

  export() {
    return exportState(this);
  },
};

export default uiTypes;
