import { action } from "easy-peasy";

import { MutableParamInfo } from "../../classes/mutableInfo";
import { setToDefault, exportNestedState } from "./utils";

function setDefaultInfo(state, sectionId, paramInfoId) {
  return setToDefault(
    state,
    sectionId,
    paramInfoId,
    () => new MutableParamInfo({ id: paramInfoId })
  );
}

const paramInfos = {
  x: {},

  setUITypeId: action((state, payload) => {
    const { sectionId, paramInfoId, uiTypeId } = payload;
    setDefaultInfo(state, sectionId, paramInfoId).uiTypeId = uiTypeId;
  }),

  setEnteredValueId: action((state, payload) => {
    const { sectionId, paramInfoId, enteredValueId } = payload;
    setDefaultInfo(state, sectionId, paramInfoId).enteredValueId =
      enteredValueId;
  }),

  setChildId: action((state, payload) => {
    const { sectionId, paramInfoId, childId } = payload;
    setDefaultInfo(state, sectionId, paramInfoId).childId = childId;
  }),

  deleteParamInfo: action((state, payload) => {
    const { sectionId, ids } = payload;
    state.x[sectionId] = _.omit(state.x[sectionId], ids);
  }),

  export() {
    return exportNestedState(this);
  },
};

export default paramInfos;
