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

  setEnteredValue: action((state, payload) => {
    const { sectionId, paramInfoId, value } = payload;
    setDefaultInfo(state, sectionId, paramInfoId).enteredValue = value;
  }),

  setChildId: action((state, payload) => {
    const { sectionId, paramInfoId, childId } = payload;
    setDefaultInfo(state, sectionId, paramInfoId).childId = childId;
  }),

  deleteParamInfo: action((state, payload) => {
    const { ids } = payload;
    state.x = _.omit(state.x, ids);
  }),

  export() {
    return exportNestedState(this);
  },
};

export default paramInfos;
