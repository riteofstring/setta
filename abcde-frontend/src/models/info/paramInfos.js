import { action } from "easy-peasy";

import { MutableParamInfo } from "../../classes/mutableInfo";

function setToDefault(state, sectionId, paramInfoId) {
  if (!(sectionId in state.x)) {
    state.x[sectionId] = {};
  }
  if (!(paramInfoId in state.x[sectionId])) {
    state.x[sectionId][paramInfoId] = new MutableParamInfo({
      id: paramInfoId,
    });
  }
}

const paramInfos = {
  x: {},

  setUITypeId: action((state, payload) => {
    const { sectionId, paramInfoId, uiTypeId } = payload;
    setToDefault(state, sectionId, paramInfoId);
    state.x[sectionId][paramInfoId].uiTypeId = uiTypeId;
  }),

  setEnteredValue: action((state, payload) => {
    const { sectionId, paramInfoId, value } = payload;
    setToDefault(state, sectionId, paramInfoId);
    state.x[sectionId][paramInfoId].enteredValue = value;
  }),

  setChildId: action((state, payload) => {
    const { sectionId, paramInfoId, childId } = payload;
    setToDefault(state, sectionId, paramInfoId);
    state.x[sectionId][paramInfoId].childId = childId;
  }),
};

export default paramInfos;
