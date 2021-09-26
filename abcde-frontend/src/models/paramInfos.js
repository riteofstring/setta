import { action } from "easy-peasy";

const paramInfos = {
  paramInfo: {},
  uiTypeId: {},
  enteredValue: {},
  childId: {},

  setParamInfo: action((state, payload) => {
    state.paramInfo = payload(state.paramInfo);
  }),

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
