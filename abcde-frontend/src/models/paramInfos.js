import { action } from "easy-peasy";

import { MutableParamInfo } from "../classes/mutableInfo";
import { SimpleHistory } from "../classes/simpleHistory";
import { createDefaultNestedDict, setDefault } from "../utils/utils";

function defaultSetter(state, payload) {
  const { sectionId, paramInfoId } = payload;
  return setDefault(state.x, [sectionId, paramInfoId], (id) => {
    return { id };
  });
}

const paramInfos = {
  x: {},

  setUITypeId: action((state, payload) => {
    const { uiTypeId } = payload;
    defaultSetter(state, payload).uiTypeId = uiTypeId;
  }),

  setEnteredValue: action((state, payload) => {
    const { value } = payload;
    defaultSetter(state, payload).enteredValue = value;
  }),

  setChildId: action((state, payload) => {
    const { childId } = payload;
    defaultSetter(state, payload).childId = childId;
  }),
};

export default paramInfos;
