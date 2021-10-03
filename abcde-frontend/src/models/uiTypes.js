import { action, debug } from "easy-peasy";

import { SimpleHistory } from "../classes/simpleHistory";
import { UIType } from "../classes/uiType";
import { createDefaultNestedDict, setDefault } from "../utils/utils";

function defaultSetter(state, payload) {
  const { uiTypeId } = payload;
  return setDefault(state.x, [uiTypeId], (id) => {
    return { id };
  });
}

const uiTypes = {
  x: {},

  setName: action((state, payload) => {
    const { name } = payload;
    defaultSetter(state, payload).name = name;
    console.log("setName", debug(state.x));
  }),

  setConfigId: action((state, payload) => {
    const { configId } = payload;
    defaultSetter(state, payload).configId = configId;
  }),
};

export default uiTypes;
