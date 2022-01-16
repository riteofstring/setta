import { MutableParamUITypeInfo } from "classes/mutableInfo";
import { action } from "easy-peasy";

function setMutableParamUITypeInfo(state, paramInfoId) {
  if (!(paramInfoId in state.x)) {
    state.x[paramInfoId] = new MutableParamUITypeInfo({ id: paramInfoId });
  }
  return state.x[paramInfoId];
}

const paramDefaults = {
  x: {},

  setUITypeId: action((state, payload) => {
    const { paramInfoId, uiTypeId } = payload;
    setMutableParamUITypeInfo(state, paramInfoId).uiTypeId = uiTypeId;
  }),

  export() {
    return this.x;
  },
};

export default paramDefaults;
