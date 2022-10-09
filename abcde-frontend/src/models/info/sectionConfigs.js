import { action } from "easy-peasy";

const sectionConfigs = {
  x: {},

  setSectionConfig: action((state, payload) => {
    state.x = payload(state.x);
  }),

  setSectionConfigAttr: action((state, payload) => {
    const { configId, attr, value } = payload;
    state.x[configId][attr] = value;
  }),
};

export default sectionConfigs;
