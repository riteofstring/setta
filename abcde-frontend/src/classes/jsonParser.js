import { nullOrUndefined, allDefined } from "../utils/utils";
import { combineModules, combineParameters } from "../utils/utils";

export const createJson = (specs, available) => {
  if (Array.isArray(specs)) {
    return combineModules(available.modules, specs);
  } else {
    return {
      ...combineModules(available.modules, specs["modules"]),
      ...combineParameters(available.parameters, specs["parameters"]),
    };
  }
};

const getInfos = (jsonInput, infoTypes, infoTypeStr, key_in_json) => {
  let outputObject = {};
  let info = jsonInput;
  if (key_in_json) {
    info = info[infoTypeStr];
  }
  if (info) {
    let infoTypeObj = infoTypes[infoTypeStr];
    for (let key of Object.keys(info)) {
      outputObject[key] = new infoTypeObj(key, info[key]);
    }
  }
  return outputObject;
};

class ParameterInfo {
  constructor(name, jsonInput) {
    this.name = name;
    this.defaultVal = jsonInput.default_val;
    this.uiTypeName = jsonInput.ui_type;
    this.specs = jsonInput.type;
    this.isKwarg = jsonInput.isKwarg;
    this.isHidden = jsonInput.isHidden;
  }

  shouldHaveNested = () => {
    return Array.isArray(this.specs);
  };
}

class ObjInfo {
  constructor(name, jsonInput) {
    const infoTypes = { ParameterInfo };
    this.name = name;
    this.params = getInfos(jsonInput, infoTypes, "ParameterInfo", false);
  }
}

class ModuleInfo {
  constructor(name, jsonInput) {
    const infoTypes = { ObjInfo };
    this.name = name;
    this.objs = getInfos(jsonInput, infoTypes, "ObjInfo", false);
  }
}

export class SectionInfo {
  constructor(name, specs, available) {
    const jsonInput = createJson(specs, available);
    this.name = name;
    this.specs = specs;
    this.setModuleInfos(jsonInput);
    this.setParameterInfos(jsonInput);
  }

  getCorrectInfo = (moduleName, objName) => {
    if (allDefined(moduleName, objName)) {
      return this.moduleInfos[moduleName].objs[objName].params;
    } else {
      return this.parameterInfos;
    }
  };

  addKwarg = (moduleName, objName, paramName) => {
    const info = this.getCorrectInfo(moduleName, objName);
    const existing = info[paramName];
    if (existing && existing.isKwarg) {
      existing.isHidden = false;
    } else {
      const newParameter = new ParameterInfo(paramName, {
        default_val: "",
        ui_type: "TEXT",
        type: "",
        isKwarg: true,
        isHidden: false,
      });
      info[paramName] = newParameter;
    }
  };

  deleteKwarg = (moduleName, objName, paramName) => {
    this.getCorrectInfo(moduleName, objName)[paramName].isHidden = true;
  };

  replaceKwarg = (moduleName, objName, oldKwarg, newKwarg) => {
    const info = this.getCorrectInfo(moduleName, objName);
    info[newKwarg] = info[oldKwarg];
    delete info[oldKwarg];
  };

  getParamData = (moduleName, objName, paramName, dataName) => {
    return this.getParametersAndKwargs(moduleName, objName, (x) => !x.isHidden)[
      paramName
    ][dataName];
  };

  getAllParametersAndKwargs = (moduleName, objName) => {
    if (allDefined(moduleName, objName)) {
      return {
        ...this.moduleInfos[moduleName].objs[objName].params,
        ...this.parameterInfos,
      };
    }
    return this.parameterInfos;
  };

  getParametersAndKwargs = (moduleName, objName, inputFilter) => {
    const output = {};
    const everything = this.getAllParametersAndKwargs(moduleName, objName);
    for (let e of Object.keys(everything)) {
      if (inputFilter(everything[e])) {
        output[e] = everything[e];
      }
    }
    return output;
  };

  setParamData = (moduleName, objName, paramName, dataName, value) => {
    if (allDefined(moduleName, objName)) {
      this.moduleInfos[moduleName].objs[objName].params[paramName][
        dataName
      ] = value;
    } else {
      this.parameterInfos[paramName][dataName] = value;
    }
  };

  setModuleInfos = (jsonInput) => {
    this.moduleInfos = getInfos(jsonInput, { ModuleInfo }, "ModuleInfo", true);
  };

  setParameterInfos = (jsonInput) => {
    this.parameterInfos = getInfos(
      jsonInput,
      { ParameterInfo },
      "ParameterInfo",
      true
    );
  };
}
