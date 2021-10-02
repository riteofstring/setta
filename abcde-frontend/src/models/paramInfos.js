import { action } from "easy-peasy";

import { SimpleHistory } from "../classes/simpleHistory";

const paramInfos = {
  uiTypeId: {},
  enteredValue: new SimpleHistory(2, null),
  childId: new SimpleHistory(2, null),

  setUITypeId: action((state, payload) => {
    const { sectionId, paramInfoId, uiTypeId } = payload;
    if (state.uiTypeId[sectionId] === undefined) {
      state.uiTypeId[sectionId] = {};
    }
    state.uiTypeId[sectionId][paramInfoId] = uiTypeId;
  }),

  setEnteredValue: action((state, payload) => {
    const { sectionId, paramInfoId, value } = payload;
    state.enteredValue.h[sectionId][paramInfoId] = value;
  }),

  setChildId: action((state, payload) => {
    const { sectionId, paramInfoId, childId } = payload;
    state.childId.h[sectionId][paramInfoId] = childId;
  }),
};

export default paramInfos;
