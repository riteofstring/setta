import { nullOrUndefined, allDefined } from "../utils/utils";
import { UIType } from "./uiType";
import { combineModules, combineParameters } from "../utils/utils";

const createJson = (specs, availableModules, availableParameters) => {
  if (Array.isArray(specs) || specs["modules"]) {
    return combineModules(availableModules, specs);
  } else if (specs["parameters"]) {
    return combineParameters(availableParameters, specs["parameters"]);
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
    this.type = jsonInput.type;
    this.uiType = new UIType(jsonInput.ui_type);
    this.enteredValue = null;
    if (!(typeof this.type === "string")) {
      this.type = new SectionInfo({ name: this.name, jsonInput: this.type });
      if (!this.uiType.isNested()) {
        this.uiType = new UIType("NESTED_OBJECT");
      }
    }
  }
}

class ObjInfo {
  constructor(name, jsonInput) {
    const infoTypes = { ParameterInfo };
    this.name = name;
    this.params = getInfos(jsonInput, infoTypes, "ParameterInfo", false);
    this.kwargs = {};
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
  constructor({
    name,
    jsonInput,
    specs,
    availableModules,
    availableParameters,
  }) {
    const infoTypes = { ModuleInfo, ParameterInfo };
    if (nullOrUndefined(jsonInput)) {
      jsonInput = createJson(specs, availableModules, availableParameters);
    }
    this.name = name;
    this.moduleInfos = getInfos(jsonInput, infoTypes, "ModuleInfo", true);
    this.parameterInfos = getInfos(jsonInput, infoTypes, "ParameterInfo", true);
  }

  addKwarg = (moduleName, objName, paramName) => {
    const newParameter = new ParameterInfo(paramName, {
      defaultVal: "",
      type: "",
      defaultUIType: "UNKNOWN",
    });
    if (allDefined(moduleName, objName)) {
      this.moduleInfos[moduleName].objs[objName].kwargs[
        paramName
      ] = newParameter;
    } else {
      this.parameterInfos[paramName] = newParameter;
    }
  };

  getParamData = (moduleName, objName, paramName, dataName) => {
    if (allDefined(moduleName, objName)) {
      return this.moduleInfos[moduleName].objs[objName].params[paramName][
        dataName
      ];
    }
    return this.parameterInfos[paramName][dataName];
  };

  getObjData = (moduleName, objName, dataName) => {
    if (allDefined(moduleName, objName)) {
      return this.moduleInfos[moduleName].objs[objName][dataName];
    }
    return this.parameterInfos;
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
}
