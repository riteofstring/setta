import { action } from "easy-peasy";

const globalCurr = {
  globalCurr: {},
  sectionId: null,
  moduleName: null,
  objName: null,

  setGlobalCurr: action((state, payload) => {
    const { paramName, paramValue } = payload;
    if (!(state.sectionId in state.globalCurr)) {
      state.globalCurr[state.sectionId] = {};
    }
    if (!(state.moduleName in state.globalCurr[state.sectionId])) {
      state.globalCurr[state.sectionId][state.moduleName] = {};
    }
    if (!(state.objName in state.globalCurr[state.sectionId][state.moduleName])) {
      state.globalCurr[state.sectionId][state.moduleName][state.objName] = {};
    }
    state.globalCurr[state.sectionId][state.moduleName][state.objName][paramName] = paramValue;
  }),

  resetGlobalCurr: action((state) => {
    state.globalCurr = {};
  }),

  setCurrSectionId: action((state, payload) => {
    state.sectionId = payload
  }),

  setCurrModuleName: action((state, payload) => {
    state.moduleName = payload
  }),

  setCurrObjName: action((state, payload) => {
    state.objName = payload
  }),

};

export default globalCurr;
