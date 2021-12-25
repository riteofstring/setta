import { action } from "easy-peasy";

import { exportState } from "./utils";

const uiTypes = {
  x: {},

  setUIType: action((state, payload) => {
    const { uiTypeId, uiType } = payload;
    state.x[uiTypeId] = uiType;
  }),

  setManyUITypes: action((state, payload) => {
    const { uiTypes } = payload;
    for (let u of uiTypes) {
      state.x[u.id] = u;
    }
  }),

  setName: action((state, payload) => {
    const { uiTypeId, name } = payload;
    state.x[uiTypeId].name = name;
  }),

  setOneConfig: action((state, payload) => {
    const { uiTypeId, configName, value } = payload;
    state.x[uiTypeId].config[configName] = value;
  }),

  export() {
    return exportState(this);
  },
};

export default uiTypes;
