import { action, debug } from "easy-peasy";
import { setEntireState as setEntireStateFunc } from "../utils/commonFunctions";
import { replaceKey, descendIntoNestedObject, descendIntoNestedObjectUpToObjName } from "../utils/utils";

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

      console.log(storeName, debug(state[storeName]));
    }),

    replaceParamName: action((state, payload) => {
      const { oldKey, newKey, keysForDescent } = payload;
      const currPoint = descendIntoNestedObjectUpToObjName(
        state[storeName],
        keysForDescent,
        payloadKeys
      );
      replaceKey(currPoint, oldKey, newKey);
    }),

    deleteParamName: action((state, payload) => {
      const { deleteKey, keysForDescent } = payload;
      const currPoint = descendIntoNestedObjectUpToObjName(
        state[storeName],
        keysForDescent,
        payloadKeys
      );
      if (deleteKey in currPoint) {
        delete currPoint[deleteKey];
      }
    }),

    setEntireState: action((state, payload) => {
      setEntireStateFunc(state, payload);
    }),
  };
}

export default parameterDetailsStoreCreator;
