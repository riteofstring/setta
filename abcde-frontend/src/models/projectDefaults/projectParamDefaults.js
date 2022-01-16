import { MutableParamUITypeInfo } from "classes/mutableInfo";
import { action } from "easy-peasy";

function setMutableParamUITypeInfo(state, paramInfoId) {
  if (!(paramInfoId in state.x)) {
    state.x[paramInfoId] = new MutableParamUITypeInfo({
      id: paramInfoId,
    });
  }
  return state.x[paramInfoId];
}

const projectParamDefaults = {
  x: {},

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

  export() {
    return this.x;
  },
};

export default projectParamDefaults;
