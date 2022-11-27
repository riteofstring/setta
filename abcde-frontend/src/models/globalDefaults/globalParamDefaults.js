import { ParamTypeInfo } from "classes/mutableInfo";
import { action } from "easy-peasy";
import _ from "lodash";
import { resetState } from "models/utils";

function setParamTypeInfo(state, type) {
  if (!(type in state.x)) {
    state.x[type] = new ParamTypeInfo({ type });
  }
  return state.x[type];
}

function getInitialState() {
  return { x: {} };
}

const globalParamDefaults = {
  ...getInitialState(),

  setUITypeId: action((state, payload) => {
    const { type, uiTypeId } = payload;
    setParamTypeInfo(state, type).uiTypeId = uiTypeId;
  }),

  setManyUITypeIds: action((state, payload) => {
    const { toUITypeId } = payload;
    _.forEach(
      toUITypeId,
      (v, k) => (setParamTypeInfo(state, k).uiTypeId = v.uiTypeId)
    );
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default globalParamDefaults;
