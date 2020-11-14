export class ModuleInfo {
  constructor(name, jsonInput) {
    this.name = name;
    this.classes = this.getParameterInfo(jsonInput["classes"]);
    this.functions = this.getParameterInfo(jsonInput["functions"]);
  }

  getParameterInfo(jsonInput) {
    let outputArray = [];
    if (jsonInput) {
      for (var key of Object.keys(jsonInput)) {
        outputArray.push(new ParameterInfo(key, jsonInput[key]));
      }
    }
    return outputArray;
  }
}

export class ParameterInfo {
  constructor(name, jsonInput) {
    this.name = name;
    this.args = jsonInput;
  }
}

export class Section {
  constructor(name, jsonInput) {
    this.infoTypes = { ModuleInfo: ModuleInfo, ParameterInfo: ParameterInfo };
    this.name = name;
    this.moduleInfos = this.getInfos(jsonInput, "ModuleInfo");
    this.parameterInfos = this.getInfos(jsonInput, "ParameterInfo");
  }

  getInfos(jsonInput, infoTypeStr) {
    let outputArray = [];
    let info = jsonInput[infoTypeStr];
    if (info) {
      let infoTypeObj = this.infoTypes[infoTypeStr];
      for (var key of Object.keys(info)) {
        outputArray.push(new infoTypeObj(key, info[key]));
      }
    }
    return outputArray;
  }
}
