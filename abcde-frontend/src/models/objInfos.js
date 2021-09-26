import { action } from "easy-peasy";

const objInfos = {
  objInfo: {},
  paramInfoIds: {},

  setObjInfo: action((state, payload) => {
    const { objInfoId, objInfo } = payload;
    state.objInfo[objInfoId] = objInfo;
  }),

  setParamInfoIds: action((state, payload) => {
    const { objInfoId, paramInfoIds } = payload;
    state.paramInfoIds[objInfoId] = paramInfoIds;
  }),
};

export default objInfos;
