import { action } from "easy-peasy";

import { exportState } from "./utils";

const uiTypes = {
  x: {},
  config: {},

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

  setConfig: action((state, payload) => {
    const { uiTypeId, config } = payload;
    state.config[uiTypeId] = config;
  }),

  setManyConfigs: action((state, payload) => {
    const { configs } = payload;
    for (let u of configs) {
      state.config[u.id] = u.config;
    }
  }),

  setOneConfig: action((state, payload) => {
    const { uiTypeId, configName, newValueFn } = payload;
    const curr = state.config[uiTypeId];
    curr[configName] = newValueFn(curr[configName]);
  }),

  cloneConfig: action((state, payload) => {
    const { oldId, newId } = payload;
    state.config[newId] = _.cloneDeep(state.config[oldId]);
  }),

  export() {
    return exportState(this);
  },
};

export default uiTypes;
