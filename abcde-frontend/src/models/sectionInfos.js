import { action } from "easy-peasy";

const sectionInfos = {
  x: {},

  setSectionInfo: action((state, payload) => {
    const { sectionId, sectionInfo } = payload;
    state.x[sectionId] = sectionInfo;
  }),

  setObjCollectionIds: action((state, payload) => {
    const { sectionId, objCollectionIds } = payload;
    state.x[sectionId].objCollectionIds = objCollectionIds;
  }),

  setParamCollectionIds: action((state, payload) => {
    const { sectionId, paramCollectionIds } = payload;
    state.x[sectionId].paramCollectionIds = paramCollectionIds;
  }),
};

export default sectionInfos;
