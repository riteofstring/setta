import { action } from "easy-peasy";

const uiTypes = {
  uiType: {},

  setUIType: action((state, payload) => {
    state.uiType = payload(state.uiType);
  }),

  setOneUIType: action((state, payload) => {
    const { uiTypeId, uiType } = payload;
    state.uiType[uiTypeId] = uiType;
  }),
};

export default uiTypes;
