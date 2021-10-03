import { action } from "easy-peasy";

const sectionInfos = {
  sectionInfo: {},
  objCollectionIds: {},
  paramCollectionIds: {},

  setSectionInfo: action((state, payload) => {
    state.sectionInfo = payload(state.sectionInfo);
  }),

  setObjCollectionIds: action((state, payload) => {
    state.objCollectionIds = payload(state.objCollectionIds);
  }),

  setParamCollectionIds: action((state, payload) => {
    state.paramCollectionIds = payload(state.paramCollectionIds);
  }),
};

export default sectionInfos;
