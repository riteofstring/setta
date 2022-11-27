import { ParamTypeInfo } from "classes/mutableInfo";
import { action, thunk } from "easy-peasy";
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

  resetAndSetAll: thunk((actions, payload) => {
    actions.reset();
    actions.setAll(payload);
  }),

  setAll: action((state, payload) => {
    _.forEach(
      payload,
      (v, k) => (setParamTypeInfo(state, k).uiTypeId = v.uiTypeId)
    );
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default globalParamDefaults;
