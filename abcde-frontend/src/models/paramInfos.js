import { action } from "easy-peasy";

const paramInfos = {
  paramInfo: {},
  uiTypeId: {},
  enteredValue: {},

  setParamInfo: action((state, payload) => {
    const { paramInfoId, paramInfo } = payload;
    state.paramInfo[paramInfoId] = paramInfo;
  }),

  setEnteredValue: action((state, payload) => {
    const { paramInfoId, value } = payload;
    state.enteredValue[paramInfoId] = value;
  }),
};

export default paramInfos;
