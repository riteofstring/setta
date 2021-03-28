import { action } from "easy-peasy";
import { setEntireState as setEntireStateFunc } from "../utils/commonFunctions";

function parameterDetailsStoreCreator(storeName) {
  const capitalized = storeName.charAt(0).toUpperCase() + storeName.slice(1);
  return {
    [storeName]: {},

    [`set${capitalized}`]: action((state, payload) => {
      const { sectionId, moduleName, objName, paramName, paramValue } = payload;
      if (!(sectionId in state[storeName])) {
        state[storeName][sectionId] = {};
      }
      if (!(moduleName in state[storeName][sectionId])) {
        state[storeName][sectionId][moduleName] = {};
      }
      if (!(objName in state[storeName][sectionId][moduleName])) {
        state[storeName][sectionId][moduleName][objName] = {};
      }
      state[storeName][sectionId][moduleName][objName][paramName] = paramValue;
    }),

    setEntireState: action((state, payload) => {
      setEntireStateFunc(state, payload);
    }),
  };
}

export default parameterDetailsStoreCreator;
