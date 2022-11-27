import { MutableParamUITypeInfo } from "classes/mutableInfo";
import { action, thunk } from "easy-peasy";
import _ from "lodash";
import { resetState } from "models/utils";

function setMutableParamUITypeInfo(state, paramInfoId) {
  if (!(paramInfoId in state.x)) {
    state.x[paramInfoId] = new MutableParamUITypeInfo({
      id: paramInfoId,
    });
  }
  return state.x[paramInfoId];
}

function getInitialState() {
  return { x: {} };
}

const projectParamDefaults = {
  ...getInitialState(),

  resetAndSetAll: thunk((actions, payload) => {
    actions.reset();
    actions.setAll(payload);
  }),

  setAll: action((state, payload) => {
    _.forEach(
      payload,
      (v, k) => (setMutableParamUITypeInfo(state, k).uiTypeId = v.uiTypeId)
    );
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default projectParamDefaults;
