import { action } from "easy-peasy";
import { resetState } from "models/utils";

function getInitialState() {
  return { x: {} };
}

const sectionConfigs = {
  ...getInitialState(),

  setSectionConfig: action((state, payload) => {
    state.x = payload(state.x);
  }),

  setSectionConfigAttr: action((state, payload) => {
    const { configId, attr, value } = payload;
    state.x[configId][attr] = value;
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default sectionConfigs;
