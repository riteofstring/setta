export function clamp(number, min, max) {
  return Math.max(min, Math.min(number, max));
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

export function requiresNestedSection(uiType) {
  return ["NESTED_OBJECT", "LIST_NESTED_OBJECT"].includes(uiType);
}

function jsonCombiner(available, listOfSelection, key) {
  return {
    [key]: Object.assign({}, ...listOfSelection.map((x) => available[x][key])),
  };
}

export function combineModules(modules, listOfModules) {
  return jsonCombiner(modules, listOfModules, "ModuleInfo");
}

export function combineParameters(parameters, listOfParameters) {
  return jsonCombiner(parameters, listOfParameters, "ParameterInfo");
}
