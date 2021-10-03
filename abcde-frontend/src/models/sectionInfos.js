import { action } from "easy-peasy";

const sectionInfos = {
  sectionInfo: {},

  setSectionInfo: action((state, payload) => {
    const { sectionId, sectionInfo } = payload;
    state.sectionInfo[sectionId] = sectionInfo;
  }),

  setObjCollectionIds: action((state, payload) => {
    const { sectionId, objCollectionIds } = payload;
    state.sectionInfo[sectionId].objCollectionIds = objCollectionIds;
  }),

  setParamCollectionIds: action((state, payload) => {
    const { sectionId, paramCollectionIds } = payload;
    state.sectionInfo[sectionId].paramCollectionIds = paramCollectionIds;
  }),
};

export default sectionInfos;
