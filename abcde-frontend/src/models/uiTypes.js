import { action } from "easy-peasy";

import { SimpleHistory } from "../classes/simpleHistory";
import { UIType } from "../classes/uiType";

const uiTypes = {
  uiType: new SimpleHistory(1, () => new UIType({})),
  configId: {},

  setUIType: action((state, payload) => {
    const { uiTypeId, uiType } = payload;
    state.uiType.h[uiTypeId] = uiType;
  }),

  setConfigId: action((state, payload) => {
    const { uiTypeId, configId } = payload;
    state.configId[uiTypeId] = configId;
  }),
};

export default uiTypes;
