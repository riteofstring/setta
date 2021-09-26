import { action, debug } from "easy-peasy";

const paramInfos = {
  paramInfo: {},
  uiTypeId: {},
  enteredValue: {},

  setParamInfo: action((state, payload) => {
    state.paramInfo = payload(state.paramInfo);
  }),

  setUITypeId: action((state, payload) => {
    state.uiTypeId = payload(state.uiTypeId);
    console.log("setUITypeId", debug(state.uiTypeId));
  }),

  setEnteredValue: action((state, payload) => {
    const { paramInfoId, value } = payload;
    state.enteredValue[paramInfoId] = value;
  }),
};

export default paramInfos;
