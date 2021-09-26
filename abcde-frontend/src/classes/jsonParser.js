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
    this.name = name;
    this.specs = convertSpecsToDict(specs);
    const jsonInput = createJson(this.specs, available);
    this.setModuleInfos(jsonInput);
    this.setParameterInfos(jsonInput);
  }
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
