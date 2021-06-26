import { allDefined } from "../utils/utils";
import { combineObjects, combineParameters } from "../utils/utils";
import { UIType } from "./uiType";

export const convertSpecsToDict = (specs) => {
  if (Array.isArray(specs)) {
    return { objects: specs };
  }
  return specs;
};

export const createJson = (specs, available) => {
  const sp = convertSpecsToDict(specs);
  let output = {};
  for (let x of [
    ["objects", available.objects, combineObjects],
    ["parameters", available.parameters, combineParameters],
  ]) {
    if (x[0] in sp) {
      output = { ...output, ...x[2](x[1], sp[x[0]]) };
    }
  }
  return output;
};

const getInfos = (
  ancestorNames,
  jsonInput,
  infoTypes,
  infoTypeStr,
  key_in_json
) => {
  let outputObject = {};
  let info = jsonInput;
  if (key_in_json) {
    info = info[infoTypeStr];
  }
  if (info) {
    let infoTypeObj = infoTypes[infoTypeStr];
    for (let key of Object.keys(info)) {
      outputObject[key] = new infoTypeObj(key, ancestorNames, info[key]);
    }
  }
  return outputObject;
};

class ParameterInfo {
  constructor(name, ancestorNames, jsonInput) {
    this.name = name;
    this.ancestorNames = ancestorNames;
    this.defaultVal = jsonInput.defaultVal;
    this.type = jsonInput.type;
    this.specs = convertSpecsToDict(jsonInput.specs);
    this.isKwarg = jsonInput.isKwarg;
    this.isHidden = jsonInput.isHidden;
    this.uiType = new UIType({ name: jsonInput.uiType, specs: this.specs });
  }

  shouldHaveNested = () => {
    return (
      this.specs &&
      (this.specs.objects.length > 0 || this.specs.parameters.length > 0)
    );
  };
}

class ObjInfo {
  constructor(name, ancestorNames, jsonInput) {
    const infoTypes = { ParameterInfo };
    this.name = name;
    this.ancestorNames = ancestorNames;
    this.params = getInfos(
      [...ancestorNames, name],
      jsonInput,
      infoTypes,
      "ParameterInfo",
      false
    );
  }
}

class ModuleInfo {
  constructor(name, ancestorNames, jsonInput) {
    const infoTypes = { ObjInfo };
    this.name = name;
    this.ancestorNames = ancestorNames;
    this.objs = getInfos(
      [...ancestorNames, name],
      jsonInput,
      infoTypes,
      "ObjInfo",
      false
    );
  }
}

export class SectionInfo {
  constructor(name, specs, available, isList, isListRoot) {
    this.name = name;
    this.specs = convertSpecsToDict(specs);
    const jsonInput = createJson(this.specs, available);
    this.setModuleInfos([name], jsonInput);
    this.setParameterInfos([name], jsonInput);
    this.isList = isList;
    this.isListRoot = isListRoot;
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
        defaultVal: "",
        uiType: "TEXT",
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
      this.moduleInfos[moduleName].objs[objName].params[paramName][dataName] =
        value;
    } else {
      this.parameterInfos[paramName][dataName] = value;
    }
  };

  setModuleInfos = (name, jsonInput) => {
    this.moduleInfos = getInfos(
      name,
      jsonInput,
      { ModuleInfo },
      "ModuleInfo",
      true
    );
  };

  setParameterInfos = (name, jsonInput) => {
    this.parameterInfos = getInfos(
      name,
      jsonInput,
      { ParameterInfo },
      "ParameterInfo",
      true
    );
  };
}
