import { action } from "easy-peasy";

const sectionInfos = {
  sectionInfo: {},
  moduleInfoIds: {},
  paramInfoIds: {},

  setSectionInfo: action((state, payload) => {
    const { sectionInfoId, sectionInfo } = payload;
    state.sectionInfo[sectionInfoId] = sectionInfo;
  }),

  setModuleInfoIds: action((state, payload) => {
    const { sectionInfoId, moduleInfoIds } = payload;
    state.moduleInfoIds[sectionInfoId] = moduleInfoIds;
  }),

  setParamInfoIds: action((state, payload) => {
    const { sectionInfoId, paramInfoIds } = payload;
    state.paramInfoIds[sectionInfoId] = paramInfoIds;
  }),
};

export default sectionInfos;
