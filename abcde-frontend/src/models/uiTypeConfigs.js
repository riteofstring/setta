import { action } from "easy-peasy";

const uiTypeConfigs = {
  config: {},

  setConfig: action((state, payload) => {
    state.config = payload(state.config);
  }),

  setOneConfig: action((state, payload) => {
    const { configId, configName, value } = payload;
    state.config[configId][configName] = value;
  }),
};

export default uiTypeConfigs;
