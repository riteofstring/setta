import { action } from "easy-peasy";

const uiTypes = {
  uiType: {},

  setUIType: action((state, payload) => {
    const { uiTypeId, uiType } = payload;
    state.sectionInfo[uiTypeId] = uiType;
  }),
};

export default uiTypes;
