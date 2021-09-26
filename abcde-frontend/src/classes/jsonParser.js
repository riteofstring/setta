import { UIType } from "./uiType";

export const convertSpecsToDict = (specs) => {
  if (Array.isArray(specs)) {
    return { objects: specs };
  }
  return specs;
};

const getInfos = (jsonInput, infoType, key_in_json) => {
  const outputObject = {};
  let info = jsonInput;
  if (key_in_json) {
    info = info[infoType.name];
  }
  if (info) {
    for (let key of Object.keys(info)) {
      outputObject[key] = new infoType(key, info[key]);
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
    this.name = name;
    this.params = getInfos(jsonInput, ParameterInfo, false);
  }
}

class ModuleInfo {
  constructor(name, jsonInput) {
    this.name = name;
    this.objs = getInfos(jsonInput, ObjInfo, false);
  }
}

export class SectionInfo {
  constructor(name, jsonInput) {
    this.name = name;
    this.moduleInfos = getInfos(jsonInput, ModuleInfo, true);
    this.parameterInfos = getInfos(jsonInput, ParameterInfo, true);
  }
}
