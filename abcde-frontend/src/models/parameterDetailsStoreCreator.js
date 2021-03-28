import { action, debug } from "easy-peasy";
import { setEntireState as setEntireStateFunc } from "../utils/commonFunctions";

function parameterDetailsStoreCreator(storeName, specializedKeys) {
  const capitalized = storeName.charAt(0).toUpperCase() + storeName.slice(1);
  const payloadKeys = ["sectionId", "moduleName", "objName", "paramName"].concat(specializedKeys)
  return {
    [storeName]: {},

    [`set${capitalized}`]: action((state, payload) => {
      let currPoint = state[storeName];
      for (let i = 0; i < payloadKeys.length - 2; i++) {
        const currKey = payload[payloadKeys[i]];
        if (!(currKey in currPoint)) {
          currPoint[currKey] = {};
        }
        currPoint = currPoint[currKey];
      }
      currPoint[payload[payloadKeys[payloadKeys.length - 2]]] =
        payload[payloadKeys[payloadKeys.length - 1]];
    }),

    setEntireState: action((state, payload) => {
      setEntireStateFunc(state, payload);
    }),
  };
}

export default parameterDetailsStoreCreator;
