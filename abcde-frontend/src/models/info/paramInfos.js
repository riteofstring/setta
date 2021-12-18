import { action } from "easy-peasy";
import _ from "lodash";

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

function setDefaultChildId(state, sectionId) {
  if (!(sectionId in state.childIds)) {
    state.childIds[sectionId] = {};
  }
  return state.childIds[sectionId];
}

const paramInfos = {
  x: {},
  childIds: {},

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
    setDefaultChildId(state, sectionId)[paramInfoId] = childId;
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
