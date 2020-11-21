const getInfos = (jsonInput, infoTypes, infoTypeStr, key_in_json) => {
    let outputObject = {}
    let info = jsonInput
    if (key_in_json){
        info = info[infoTypeStr]
    }
    if (info){
        let infoTypeObj = infoTypes[infoTypeStr]
        for (let key of Object.keys(info)) {
            outputObject[key] = new infoTypeObj(key, info[key])
        }
    }
    return outputObject
}

class ParameterInfo {
    constructor(name, jsonInput){
        this.name = name
        this.default = jsonInput.default
        this.type = jsonInput.type
        this.ui_type = jsonInput.ui_type
        if (!(typeof this.type === "string")){
            this.type = new Section(this.name, this.type)
        }
    } 
}

class ObjInfo {
    constructor(name, jsonInput){
        let infoTypes = {"ParameterInfo": ParameterInfo}
        this.name = name
        this.params = getInfos(jsonInput, infoTypes, "ParameterInfo", false)
    }
}

class ModuleInfo {
    constructor(name, jsonInput){
        let infoTypes = {"ObjInfo": ObjInfo}
        this.name = name
        this.objs = getInfos(jsonInput, infoTypes, "ObjInfo", false)
    }
}

class Section {
    constructor(name, jsonInput) {
        let infoTypes = {"ModuleInfo": ModuleInfo, "ParameterInfo": ParameterInfo}
        this.name = name
        this.moduleInfos = getInfos(jsonInput, infoTypes, "ModuleInfo", true)
        this.parameterInfos = getInfos(jsonInput, infoTypes, "ParameterInfo", true)
      }
}



testJson = require('../../test.json');

sections = {}

for (let key of Object.keys(testJson)) {
    sections[key] = new Section(key, testJson[key])
}

console.log("json parsing success")