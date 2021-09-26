import { action } from "easy-peasy";

const uiTypes = {
  uiType: {},
  configId: {},

  setUIType: action((state, payload) => {
    state.uiType = payload(state.uiType);
  }),

  setConfigId: action((state, payload) => {
    state.configId = payload(state.configId);
  }),

  setOneUIType: action((state, payload) => {
    const { uiTypeId, uiType } = payload;
    state.uiType[uiTypeId] = uiType;
  }),
};

export default uiTypes;
