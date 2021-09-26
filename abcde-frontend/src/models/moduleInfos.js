import { action } from "easy-peasy";

const moduleInfos = {
  moduleInfo: {},
  objInfoIds: {},

  setModuleInfo: action((state, payload) => {
    state.moduleInfo = payload(state.moduleInfo);
  }),

  setObjInfoIds: action((state, payload) => {
    state.objInfoIds = payload(state.objInfoIds);
  }),
};

export default moduleInfos;
