import { jsonCombiner } from "../utils/utils";

const { createNewId } = require("../utils/sectionIds");

export function createInfo(infoType, ...otherArgs) {
  return (name, jsonInput) => {
    const id = createNewId();
    return { id, info: new infoType(id, name, jsonInput, ...otherArgs) };
  };
}

export const getInfos = (jsonInput, factory_fn) => {
  const output = {};
  for (let key of Object.keys(jsonInput)) {
    const { id, info } = factory_fn(key, jsonInput[key]);
    output[id] = info;
  }
  return output;
};

const createJson = (specs, available) => {
  const sp = convertSpecsToDict(specs);
  let output = {};
  for (let x of ["objects", "parameters"]) {
    if (x in sp) {
      output = { ...output, ...jsonCombiner(available[x], sp[x]) };
    }
  }
  return output;
};

const createNameToId = (children) => {
  const output = {};
  for (let c of Object.keys(children)) {
    output[children[c].name] = c;
  }
  return output;
};

export const convertSpecsToDict = (specs) => {
  if (Array.isArray(specs)) {
    return { objects: specs };
  }
  return specs;
};

export class ParameterInfo {
  constructor(id, name, jsonInput) {
    this.id = id;
    this.name = name;
    this.defaultVal = jsonInput.defaultVal;
    this.type = jsonInput.type;
    this.uiTypeName = jsonInput.uiType;
    this.uiTypeConfig = jsonInput.specs;
  }
}

export class ObjInfo {
  constructor(id, name, jsonInput) {
    this.id = id;
    this.name = name;
    this.children = getInfos(jsonInput, createInfo(ParameterInfo));
    this.nameToId = createNameToId(this.children);
  }
}

export class ModuleInfo {
  constructor(id, name, jsonInput) {
    this.id = id;
    this.name = name;
    this.children = getInfos(jsonInput, createInfo(ObjInfo));
    this.nameToId = createNameToId(this.children);
  }
}

export class AllModuleInfo {
  constructor(available) {
    const allObjs = createJson(Object.keys(available.objects), available);
    this.children = getInfos(allObjs, createInfo(ModuleInfo));
    this.nameToId = createNameToId(this.children);
  }
}

export class ObjCollectionInfo {
  constructor(id, name, modulesInCollection, allModuleInfo) {
    this.id = id;
    this.name = name;
    this.children = {};
    for (let m of Object.keys(modulesInCollection)) {
      const allObjs = allModuleInfo.children[allModuleInfo.nameToId[m]];
      const objsInCollection = modulesInCollection[m];
      for (let o of Object.keys(objsInCollection)) {
        const objId = allObjs.nameToId[o];
        this.children[objId] = allObjs.children[objId];
      }
    }
    this.nameToId = createNameToId(this.children);
  }
}

export class AllObjCollectionInfo {
  constructor(available, allModuleInfo) {
    const availableObjs = available.objects;
    this.children = getInfos(
      availableObjs,
      createInfo(ObjCollectionInfo, allModuleInfo)
    );
    this.nameToId = createNameToId(this.children);
  }
}

export class ParamCollectionInfo extends ObjInfo {}

export class AllParamCollectionInfo {
  constructor(available) {
    this.children = getInfos(
      available.parameters,
      createInfo(ParamCollectionInfo)
    );
    this.nameToId = createNameToId(this.children);
  }
}

export class SectionInfo {
  constructor(id, name, specs) {
    this.id = id;
    this.name = name;
    this.specs = convertSpecsToDict(specs);
    this.hasObjects = "objects" in this.specs;
  }
}
