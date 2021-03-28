import { action } from "easy-peasy";
import { setEntireState as setEntireStateFunc } from "../utils/commonFunctions";

const uiTypes = {
  uiTypes: {},

  setCurrUIType: action((state, payload) => {
    const { sectionId, moduleName, objName, paramName, uiType } = payload;
    if (!(sectionId in state.uiTypes)) {
      state.uiTypes[sectionId] = {};
    }
    if (!(moduleName in state.uiTypes[sectionId])) {
      state.uiTypes[sectionId][moduleName] = {};
    }
    if (!(objName in state.uiTypes[sectionId][moduleName])) {
      state.uiTypes[sectionId][moduleName][objName] = {};
    }
    state.uiTypes[sectionId][moduleName][objName][paramName] = uiType;
  }),

  setUITypes: action((state, payload) => {
    state.uiTypes = payload;
  }),

  setEntireState: action((state, payload) => {
    setEntireStateFunc(state, payload);
  }),
};

export default uiTypes;
