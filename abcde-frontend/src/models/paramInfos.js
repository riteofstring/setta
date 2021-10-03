import { action } from "easy-peasy";

import { MutableParamInfo } from "../classes/mutableInfo";
import { SimpleHistory } from "../classes/simpleHistory";

const paramInfos = {
  x: new SimpleHistory(2, (id) => new MutableParamInfo({ id })),

  setUITypeId: action((state, payload) => {
    const { sectionId, paramInfoId, uiTypeId } = payload;
    state.x.h[sectionId][paramInfoId].uiTypeId = uiTypeId;
  }),

  setEnteredValue: action((state, payload) => {
    const { sectionId, paramInfoId, value } = payload;
    state.x.h[sectionId][paramInfoId].enteredValue = value;
  }),

  setChildId: action((state, payload) => {
    const { sectionId, paramInfoId, childId } = payload;
    state.x.h[sectionId][paramInfoId].childId = childId;
  }),
};

export default paramInfos;
