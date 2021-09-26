import { action } from "easy-peasy";

const sectionInfos = {
  sectionInfo: {},

  setSectionInfo: action((state, payload) => {
    const { sectionInfoId, sectionInfo } = payload;
    state.sectionInfo[sectionInfoId] = sectionInfo;
  }),
};

export default sectionInfos;
