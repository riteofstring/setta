import { ParamTypeInfo } from "classes/mutableInfo";
import { action, thunk } from "easy-peasy";
import _ from "lodash";
import { resetState } from "models/utils";

function setCodeInfoTypeMap(state, type) {
  if (!(type in state.codeInfoTypeMaps)) {
    state.codeInfoTypeMaps[type] = new ParamTypeInfo({ type });
  }
  return state.codeInfoTypeMaps[type];
}

function getInitialState() {
  return { codeInfoTypeMaps: {} };
}

const userCodeInfoMaps = {
  ...getInitialState(),

  resetAndSetAll: thunk((actions, payload) => {
    actions.reset();
    actions.setAll(payload);
  }),

  setAll: action((state, payload) => {
    _.forEach(
      payload,
      (v, k) => (setCodeInfoTypeMap(state, k).uiTypeId = v.uiTypeId)
    );
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default userCodeInfoMaps;
