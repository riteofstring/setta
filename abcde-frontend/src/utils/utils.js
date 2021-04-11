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

export function flattenDictOfArrays(x) {
  return [].concat.apply(
    [],
    Object.keys(x).map((e) => x[e])
  );
}

function getParametersHelper(paramSource) {
  let returnParameters = [];
  for (let key of Object.keys(paramSource)) {
    returnParameters.push(paramSource[key]);
  }
  return returnParameters;
}

export function getParameters(sectionInfo, moduleName, objName) {
  if (sectionInfo) {
    if (
      moduleName &&
      objName &&
      Object.keys(sectionInfo.moduleInfos).length > 0
    ) {
      return getParametersHelper(
        sectionInfo.moduleInfos[moduleName].objs[objName].params
      );
    } else if (Object.keys(sectionInfo.parameterInfos).length > 0) {
      return getParametersHelper(sectionInfo.parameterInfos);
    }
  }
  return [];
}

export function requiresNestedSection(uiTypeName) {
  return ["NESTED_OBJECT", "LIST_NESTED_OBJECT"].includes(uiTypeName);
}

function jsonCombiner(available, listOfSelection, key) {
  if (listOfSelection){
    return {
      [key]: Object.assign({}, ...listOfSelection.map((x) => available[x][key])),
    };
  }
  return {}
}

export function combineModules(modules, listOfModules) {
  return jsonCombiner(modules, listOfModules, "ModuleInfo");
}

export function combineParameters(parameters, listOfParameters) {
  return jsonCombiner(parameters, listOfParameters, "ParameterInfo");
}

export function descendIntoNestedObject(
  currPoint,
  payload,
  payloadKeys,
  depthFromEnd = null,
  stopAtKey = null
) {
  depthFromEnd = depthFromEnd !== null ? depthFromEnd : 0;
  for (let i = 0; i < payloadKeys.length - depthFromEnd; i++) {
    const currKey = payload[payloadKeys[i]];
    if (currKey) {
      if (!(currKey in currPoint)) {
        currPoint[currKey] = {};
      }
      currPoint = currPoint[currKey];
      if (payload[stopAtKey] === currKey) {
        break;
      }
    }
  }
  return currPoint;
}

export function descendIntoNestedObjectUpToObjName(
  currPoint,
  keysForDescent,
  payloadKeys
) {
  currPoint = descendIntoNestedObject(
    currPoint,
    keysForDescent,
    payloadKeys,
    null,
    "objName"
  );
  return currPoint;
}

// https://stackoverflow.com/a/14592469
export function replaceKey(inputObject, oldKey, newKey) {
  if (inputObject?.[oldKey] && oldKey !== newKey) {
    inputObject[newKey] = inputObject[oldKey];
    delete inputObject[oldKey];
  }
}

export function parameterStateDetailsGetter(
  state,
  sectionId,
  moduleName,
  objName,
  paramName
) {
  if (sectionId && paramName) {
    if (moduleName && objName) {
      return state[sectionId]?.[moduleName]?.[objName]?.[paramName];
    }
    return state[sectionId]?.[paramName];
  }
  return null;
}

export function sectionParameterGetter(
  state,
  sectionId,
  moduleName,
  objName,
  paramName
) {
  if (sectionId && paramName) {
    if (moduleName && objName) {
      return state[sectionId]?.moduleInfos[moduleName]?.objs[objName]?.params[
        paramName
      ];
    }
    return state[sectionId]?.parameterInfos[paramName];
  }
  return null;
}
