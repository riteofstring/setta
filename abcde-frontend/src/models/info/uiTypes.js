import { action } from "easy-peasy";

import { SimpleHistory } from "../../classes/simpleHistory";
import { UIType } from "../../classes/uiType";

const uiTypes = {
  x: new SimpleHistory(1, (id) => new UIType({ id })),

  setUIType: action((state, payload) => {
    const { uiTypeId, uiType } = payload;
    state.x.h[uiTypeId] = uiType;
  }),

  setConfigId: action((state, payload) => {
    const { uiTypeId, configId } = payload;
    state.x.h[uiTypeId].configId = configId;
  }),
};

export default uiTypes;
