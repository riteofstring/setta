import { action } from "easy-peasy";

const sectionInfos = {
  sectionInfo: {},
  moduleInfoIds: {},

  setSectionInfo: action((state, payload) => {
    const { sectionInfoId, sectionInfo } = payload;
    state.sectionInfo[sectionInfoId] = sectionInfo;
  }),

  setModuleInfoIds: action((state, payload) => {
    const { sectionInfoId, moduleInfoIds } = payload;
    state.moduleInfoIds[sectionInfoId] = moduleInfoIds;
  }),
};

export default sectionInfos;
