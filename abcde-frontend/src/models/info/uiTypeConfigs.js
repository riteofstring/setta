import { action } from "easy-peasy";

const uiTypeConfigs = {
  x: {},

  setConfig: action((state, payload) => {
    const { configId, config } = payload;
    state.x[configId] = config;
  }),

  setOneConfig: action((state, payload) => {
    const { configId, configName, value } = payload;
    state.x[configId][configName] = value;
  }),

  export() {
    return this.x;
  },
};

export default uiTypeConfigs;
