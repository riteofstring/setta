import { action } from "easy-peasy";

import { SimpleHistory } from "../classes/simpleHistory";

const paramInfos = {
  uiTypeId: new SimpleHistory(2, null),
  enteredValue: new SimpleHistory(2, null),
  childId: new SimpleHistory(2, null),

  setUITypeId: action((state, payload) => {
    const { sectionId, paramInfoId, uiTypeId } = payload;
    state.uiTypeId.h[sectionId][paramInfoId] = uiTypeId;
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
