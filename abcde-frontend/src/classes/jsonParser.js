import { allDefined } from "../utils/utils";
import { UIType } from "./uiType";

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
      this.type = new SectionInfo(this.name, this.type);
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
  constructor(name, jsonInput) {
    const infoTypes = { ModuleInfo, ParameterInfo };
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

  getKwargs = (moduleName, objName) => {
    if (allDefined(moduleName, objName)) {
      return this.moduleInfos[moduleName].objs[objName].kwargs;
    }
    return {};
  };

  getParameters = (moduleName, objName) => {
    if (allDefined(moduleName, objName)) {
      return this.moduleInfos[moduleName].objs[objName].params;
    }
    return this.parameterInfos;
  };

  getValue = (moduleName, objName, paramName) => {
    if (allDefined(moduleName, objName)) {
      return this.moduleInfos[moduleName].objs[objName].params[paramName]
        .enteredValue;
    }
    return this.parameterInfos[paramName].enteredValue;
  };

  getParamUIType = (moduleName, objName, paramName) => {
    if (allDefined(moduleName, objName)) {
      return this.moduleInfos[moduleName].objs[objName].params[paramName]
        .uiType;
    }
    return this.parameterInfos[paramName].uiType;
  };

  setValue = (moduleName, objName, paramName, value) => {
    if (allDefined(moduleName, objName)) {
      this.moduleInfos[moduleName].objs[objName].params[
        paramName
      ].enteredValue = value;
    } else {
      this.parameterInfos[paramName].enteredValue = value;
    }
  };

  setParamUIType = (moduleName, objName, paramName, uiName) => {
    if (allDefined(moduleName, objName)) {
      this.moduleInfos[moduleName].objs[objName].params[
        paramName
      ].uiType = new UIType(uiName);
    } else {
      this.parameterInfos[paramName].uiType = new UIType(uiName);
    }

    console.log("setParamUIType", this)
  };
}
