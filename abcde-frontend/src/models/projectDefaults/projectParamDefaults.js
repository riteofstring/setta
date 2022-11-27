import { MutableParamUITypeInfo } from "classes/mutableInfo";
import { action } from "easy-peasy";
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

  setUITypeId: action((state, payload) => {
    const { paramInfoId, uiTypeId } = payload;
    setMutableParamUITypeInfo(state, paramInfoId).uiTypeId = uiTypeId;
  }),

  setManyUITypeIds: action((state, payload) => {
    const { toUITypeId } = payload;
    _.forEach(
      toUITypeId,
      (v, k) => (setMutableParamUITypeInfo(state, k).uiTypeId = v.uiTypeId)
    );
  }),

  reset: action((state) => {
    resetState(state, getInitialState());
  }),
};

export default projectParamDefaults;
