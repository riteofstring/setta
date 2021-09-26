import { action } from "easy-peasy";

const sectionInfos = {
  sectionInfo: {},
  moduleInfoIds: {},
  paramInfoIds: {},

  setSectionInfo: action((state, payload) => {
    state.sectionInfo = payload(state.sectionInfo);
  }),

  setModuleInfoIds: action((state, payload) => {
    state.moduleInfoIds = payload(state.moduleInfoIds);
  }),

  setParamInfoIds: action((state, payload) => {
    state.paramInfoIds = payload(state.paramInfoIds);
  }),
};

export default sectionInfos;
