import { action } from "easy-peasy";

const paramInfos = {
  paramInfo: {},
  uiTypeId: {},

  setParamInfo: action((state, payload) => {
    const { paramInfoId, paramInfo } = payload;
    state.paramInfo[paramInfoId] = paramInfo;
  }),
};

export default paramInfos;
