import { action } from "easy-peasy";

const sectionInfos = {
  sectionInfo: {},
  objCollectionIds: {},
  paramCollectionIds: {},
  sectionTypeId: {},

  setSectionInfo: action((state, payload) => {
    state.sectionInfo = payload(state.sectionInfo);
  }),

  setObjCollectionIds: action((state, payload) => {
    state.objCollectionIds = payload(state.objCollectionIds);
  }),

  setParamCollectionIds: action((state, payload) => {
    state.paramCollectionIds = payload(state.paramCollectionIds);
  }),

  setSectionTypeId: action((state, payload) => {
    const { sectionInfoId, sectionTypeId } = payload;
    state.sectionTypeId[sectionInfoId] = sectionTypeId;
  }),
};

export default sectionInfos;
