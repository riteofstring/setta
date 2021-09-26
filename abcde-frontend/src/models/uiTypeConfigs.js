import { action } from "easy-peasy";

const uiTypeConfigs = {
  config: {},

  setConfig: action((state, payload) => {
    state.config = payload(state.config);
  }),

  setOneConfig: action((state, payload) => {
    const { configId, config } = payload;
    state.config[configId] = config;
  }),
};

export default uiTypeConfigs;
