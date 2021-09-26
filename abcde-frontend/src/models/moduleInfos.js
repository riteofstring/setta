import { action } from "easy-peasy";

const moduleInfos = {
  moduleInfo: {},
  objInfoId: {},

  setModuleInfo: action((state, payload) => {
    const { moduleInfoId, moduleInfo } = payload;
    state.sectionInfo[moduleInfoId] = moduleInfo;
  }),
};

export default moduleInfos;
