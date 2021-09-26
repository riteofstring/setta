import { action } from "easy-peasy";

const moduleInfos = {
  moduleInfo: {},
  objInfoIds: {},

  setModuleInfo: action((state, payload) => {
    const { moduleInfoId, moduleInfo } = payload;
    state.moduleInfo[moduleInfoId] = moduleInfo;
  }),

  setObjInfoIds: action((state, payload) => {
    const { moduleInfoId, objInfoIds } = payload;
    state.objInfoIds[moduleInfoId] = objInfoIds;
  }),
};

export default moduleInfos;
