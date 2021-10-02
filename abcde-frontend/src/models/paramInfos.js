import { action } from "easy-peasy";

const paramInfos = {
  uiTypeId: {},
  childId: {},

  setUITypeId: action((state, payload) => {
    const { sectionId, paramInfoId, uiTypeId } = payload;
    if (state.uiTypeId[sectionId] === undefined) {
      state.uiTypeId[sectionId] = {};
    }
    state.uiTypeId[sectionId][paramInfoId] = uiTypeId;
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
