import { action } from "easy-peasy";

const paramInfos = {
  uiTypeId: {},
  enteredValue: {},
  childId: {},

  setUITypeId: action((state, payload) => {
    const { sectionId, paramInfoId, uiTypeId } = payload;
    if (state.uiTypeId[sectionId] === undefined) {
      state.uiTypeId[sectionId] = {};
    }
    state.uiTypeId[sectionId][paramInfoId] = uiTypeId;
  }),

  setEnteredValue: action((state, payload) => {
    const { sectionId, paramInfoId, value } = payload;
    if (state.enteredValue[sectionId] === undefined) {
      state.enteredValue[sectionId] = {};
    }
    state.enteredValue[sectionId][paramInfoId] = value;
  }),

  setChildId: action((state, payload) => {
    const { sectionId, paramInfoId, childId } = payload;
    if (state.childId[sectionId] === undefined) {
      state.childId[sectionId] = {};
    }
    state.childId[sectionId][paramInfoId] = childId;
  }),
};

export default paramInfos;
