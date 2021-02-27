import { action } from "easy-peasy";
import { setEntireState as setEntireStateFunc } from "../utils/commonFunctions";

const globalCurr = {
  globalCurr: {},

  setCurrParam: action((state, payload) => {
    const { sectionId, moduleName, objName, paramName, paramValue } = payload;
    if (!(sectionId in state.globalCurr)) {
      state.globalCurr[sectionId] = {};
    }
    if (!(moduleName in state.globalCurr[sectionId])) {
      state.globalCurr[sectionId][moduleName] = {};
    }
    if (!(objName in state.globalCurr[sectionId][moduleName])) {
      state.globalCurr[sectionId][moduleName][objName] = {};
    }
    state.globalCurr[sectionId][moduleName][objName][paramName] = paramValue;
  }),

  setGlobalCurr: action((state, payload) => {
    state.globalCurr = payload;
  }),

  resetGlobalCurr: action((state, payload) => {
    state.globalCurr = {};
  }),

  setEntireState: action((state, payload) => {
    setEntireStateFunc(state, payload);
  }),
};

export default globalCurr;
