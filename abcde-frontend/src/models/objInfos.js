import { action } from "easy-peasy";

const objInfos = {
  objInfo: {},
  paramInfoIds: {},

  setObjInfo: action((state, payload) => {
    state.objInfo = payload(state.objInfo);
  }),

  setParamInfoIds: action((state, payload) => {
    state.paramInfoIds = payload(state.paramInfoIds);
  }),
};

export default objInfos;
