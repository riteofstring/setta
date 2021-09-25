import { v4 as uuidv4 } from "uuid";

export function clamp(number, min, max) {
  return Math.max(min, Math.min(number, max));
}

export function nullOrUndefined(x) {
  return x === null || x === undefined;
}

export function allDefined(...x) {
  return x.every((a) => !nullOrUndefined(a));
}

// https://stackoverflow.com/a/63954561
export function defaultDict(defaultValueFn) {
  const handler = {
    get: (obj, prop) => {
      if (!(prop in obj)) obj[prop] = defaultValueFn();
      return obj[prop];
    },
  };
  return new Proxy({}, handler);
}

export function createDefaultNestedDict(levels, finalType) {
  if (levels === 0) {
    return finalType;
  }
  return defaultDict(() => createDefaultNestedDict(levels - 1, finalType));
}

// https://stackoverflow.com/a/38181008
// create new array with inserted value (no mutation)
export function insertIntoArray(arr, index, ...newItems) {
  return [
    // part of the array before the specified index
    ...arr.slice(0, index),
    // inserted items
    ...newItems,
    // part of the array after the specified index
    ...arr.slice(index),
  ];
}

export function insertIntoArrayOrPrepend(arr, index, ...newItems) {
  if (index === null) {
    return [...newItems, ...arr];
  } else {
    return insertIntoArray(arr, index, ...newItems);
  }
}

export function flattenDictOfArrays(x) {
  return [].concat.apply(
    [],
    Object.keys(x).map((e) => x[e])
  );
}

function jsonCombiner(available, listOfSelection, key) {
  if (listOfSelection) {
    return {
      [key]: Object.assign(
        {},
        ...listOfSelection.map((x) => available[x][key])
      ),
    };
  }
  return {};
}

export function combineObjects(objects, listOfObjects) {
  return jsonCombiner(objects, listOfObjects, "ModuleInfo");
}

export function combineParameters(parameters, listOfParameters) {
  return jsonCombiner(parameters, listOfParameters, "ParameterInfo");
}

export function firstValue(x) {
  const keys = Object.keys(x);
  if (keys.length > 0) {
    return x[keys[0]];
  }
  return undefined;
}

export function rangeArray(low, high) {
  return Array.from(new Array(high), (x, i) => i + low);
}

export function mod(n, m) {
  return ((n % m) + m) % m;
}

export function generateUUIDs(number) {
  return [...Array(number)].map((x) => uuidv4());
}

export function createSelectedString(moduleName, objName) {
  if (!nullOrUndefined(moduleName) && !nullOrUndefined(objName)) {
    return `${moduleName}~${objName}`;
  }
  return null;
}

export function curryAction(action, args, key = null) {
  const fn = (newState) => {
    const asArg = key ? {[key]: newState} : newState;
    return action({ ...args, ...asArg });
  };
  return fn;
}

export function defaultState(state, value) {
  return state === undefined ? value : state;
}
