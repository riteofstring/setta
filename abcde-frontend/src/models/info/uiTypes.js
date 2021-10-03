import { action } from "easy-peasy";

const uiTypes = {
  x: {},

  setUIType: action((state, payload) => {
    const { uiTypeId, uiType } = payload;
    state.x[uiTypeId] = uiType;
  }),

  setConfigId: action((state, payload) => {
    const { uiTypeId, configId } = payload;
    state.x[uiTypeId].configId = configId;
  }),
};

export default uiTypes;
