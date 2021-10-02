import { action } from "easy-peasy";

const paramInfos = {
  uiTypeId: {},
  enteredValue: {},
  childId: {},

  setUITypeId: action((state, payload) => {
    state.uiTypeId = payload(state.uiTypeId);
  }),

  setEnteredValue: action((state, payload) => {
    const { paramInfoId, value } = payload;
    state.enteredValue[paramInfoId] = value;
  }),

  setChildId: action((state, payload) => {
    const { paramInfoId, childId } = payload;
    state.childId[paramInfoId] = childId;
  }),
};

export default paramInfos;
