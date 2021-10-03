import { action } from "easy-peasy";

const sectionInfos = {
  sectionInfo: {},
  objCollectionIds: {},
  paramCollectionIds: {},

  setSectionInfo: action((state, payload) => {
    const { sectionId, sectionInfo } = payload;
    state.sectionInfo[sectionId] = sectionInfo;
  }),

  setObjCollectionIds: action((state, payload) => {
    const { sectionId, objCollectionIds } = payload;
    state.objCollectionIds[sectionId] = objCollectionIds;
  }),

  setParamCollectionIds: action((state, payload) => {
    const { sectionId, paramCollectionIds } = payload;
    state.paramCollectionIds[sectionId] = paramCollectionIds;
  }),
};

export default sectionInfos;
