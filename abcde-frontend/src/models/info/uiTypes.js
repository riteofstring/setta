import { action } from "easy-peasy";

import { exportState } from "./utils";

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

  setName: action((state, payload) => {
    const { uiTypeId, name } = payload;
    state.x[uiTypeId].name = name;
  }),

  export() {
    return exportState(this);
  },
};

export default uiTypes;
