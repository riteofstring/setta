import { action, debug } from "easy-peasy";
import { setEntireState as setEntireStateFunc } from "../utils/commonFunctions";
import { replaceKey, descendIntoNestedObject } from "../utils/utils";

function parameterDetailsStoreCreator(storeName, specializedKeys) {
  const capitalized = storeName.charAt(0).toUpperCase() + storeName.slice(1);
  const payloadKeys = [
    "sectionId",
    "moduleName",
    "objName",
    "paramName",
  ].concat(specializedKeys);
  return {
    [storeName]: {},

    [`set${capitalized}`]: action((state, payload) => {
      let currPoint = state[storeName];
      currPoint = descendIntoNestedObject(currPoint, payload, payloadKeys, 2);
      currPoint[payload[payloadKeys[payloadKeys.length - 2]]] =
        payload[payloadKeys[payloadKeys.length - 1]];
    }),

    replaceParamName: action((state, payload) => {
      const { oldKey, newKey, keysForDescent } = payload;
      let currPoint = state[storeName];
      currPoint = descendIntoNestedObject(
        currPoint,
        keysForDescent,
        payloadKeys,
        null,
        "objName"
      );
      replaceKey(currPoint, oldKey, newKey);
    }),

    setEntireState: action((state, payload) => {
      setEntireStateFunc(state, payload);
    }),
  };
}

export default parameterDetailsStoreCreator;
