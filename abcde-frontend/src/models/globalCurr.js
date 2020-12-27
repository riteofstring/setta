import { action } from "easy-peasy";

const globalCurr = {
  globalCurr: {},
  sectionId: null,
  moduleName: null,
  objName: null,

  setCurrParam: action((state, payload) => {
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

  setSectionId: action((state, payload) => {
    state.sectionId = payload
  }),

  setModuleName: action((state, payload) => {
    state.moduleName = payload
  }),

  setObjName: action((state, payload) => {
    state.objName = payload
  }),

  setCurr: action((state, payload) => {
    const {moduleName, objName} = payload
    console.log("setting curr", moduleName, objName)
    state.moduleName = moduleName
    state.objName = objName
  }),

};

export default globalCurr;
