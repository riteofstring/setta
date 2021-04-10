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
    this.defaultUIType = jsonInput.ui_type;
    if (!(typeof this.type === "string")) {
      this.type = new SectionInfo(this.name, this.type);
    }
  }
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
  constructor(name, jsonInput) {
    const infoTypes = { ModuleInfo, ParameterInfo };
    this.name = name;
    this.moduleInfos = getInfos(jsonInput, infoTypes, "ModuleInfo", true);
    this.parameterInfos = getInfos(jsonInput, infoTypes, "ParameterInfo", true);
  }
}
