import { allDefined } from "../utils/utils";
import { UIType } from "./uiType";
import { combineModules, combineParameters } from "../utils/utils";

export const createJson = (specs, available) => {
  if (Array.isArray(specs) || specs["modules"]) {
    return combineModules(available.modules, specs);
  } else if (specs["parameters"]) {
    return combineParameters(available.parameters, specs["parameters"]);
  }
  return {};
};

const getInfos = (
  jsonInput,
  available,
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
      outputObject[key] = new infoTypeObj(key, info[key], available);
    }
  }
  return outputObject;
};

class ParameterInfo {
  constructor(name, jsonInput, available) {
    this.name = name;
    this.defaultVal = jsonInput.default_val;
    this.type = jsonInput.type;
    this.uiType = new UIType({ name: jsonInput.ui_type, datatype: this.type });
    if (!(typeof this.type === "string")) {
      this.type = new SectionInfo(this.name, this.type, available);
      if (!this.uiType.isNested()) {
        this.uiType = new UIType({
          name: "NESTED_OBJECT",
          datatype: this.type,
        });
      }
    }
  }
}

class ObjInfo {
  constructor(name, jsonInput, available) {
    const infoTypes = { ParameterInfo };
    this.name = name;
    this.params = getInfos(
      jsonInput,
      available,
      infoTypes,
      "ParameterInfo",
      false
    );
    this.kwargs = {};
  }
}

class ModuleInfo {
  constructor(name, jsonInput, available) {
    const infoTypes = { ObjInfo };
    this.name = name;
    this.objs = getInfos(jsonInput, available, infoTypes, "ObjInfo", false);
  }
}

export class SectionInfo {
  constructor(name, specs, available) {
    const jsonInput = createJson(specs, available);
    this.name = name;
    this.setModuleInfos(jsonInput, available);
    this.setParameterInfos(jsonInput, available);
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

  setModuleInfos = (jsonInput, available) => {
    this.moduleInfos = getInfos(
      jsonInput,
      available,
      { ModuleInfo },
      "ModuleInfo",
      true
    );
  };

  setParameterInfos = (jsonInput, available) => {
    this.parameterInfos = getInfos(
      jsonInput,
      available,
      { ParameterInfo },
      "ParameterInfo",
      true
    );
  };
}
