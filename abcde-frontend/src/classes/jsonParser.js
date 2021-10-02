import { combineObjects, combineParameters } from "../utils/utils";

const { createNewId } = require("../utils/sectionIds");

export function createParameterInfo() {
  return (name, jsonInput) => {
    const id = createNewId();
    return { id, info: new ParameterInfo(id, name, jsonInput) };
  };
}

export function createObjInfo() {
  return (name, jsonInput) => {
    const id = createNewId();
    return { id, info: new ObjInfo(id, name, jsonInput) };
  };
}

export function createModuleInfo() {
  return (name, jsonInput) => {
    const id = createNewId();
    return { id, info: new ModuleInfo(id, name, jsonInput) };
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
    this.specs = convertSpecsToDict(jsonInput.specs);
    this.isKwarg = jsonInput.isKwarg;
    this.isHidden = jsonInput.isHidden;
  }

  shouldHaveNested = () => {
    return (
      this.specs &&
      (this.specs.objects.length > 0 || this.specs.parameters.length > 0)
    );
  };
}

export class ParamCollectionInfo {
  constructor(id, name, jsonInput) {
    this.id = id;
    this.name = name;
  }
}

export class ObjInfo {
  constructor(id, name, jsonInput) {
    this.id = id;
    this.name = name;
    this.children = getInfos(jsonInput, createParameterInfo());
    this.nameToId = createNameToId(this.children);
  }
}

export class ModuleInfo {
  constructor(id, name, jsonInput) {
    this.id = id;
    this.name = name;
    this.children = getInfos(jsonInput, createObjInfo());
    this.nameToId = createNameToId(this.children);
  }
}

export class AllModuleInfo {
  constructor(available) {
    const allObjs = createJson(
      Object.keys(available.objects),
      available
    ).ModuleInfo;

    this.children = getInfos(allObjs, createModuleInfo());
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
    this.children = {};
    for (let c of Object.keys(availableObjs)) {
      const modulesInCollection = availableObjs[c].ModuleInfo;
      const id = createNewId();
      this.children[id] = new ObjCollectionInfo(
        id,
        c,
        modulesInCollection,
        allModuleInfo
      );
    }
    this.nameToId = createNameToId(this.children);
  }
}

export class SectionInfo {
  constructor(id, name, jsonInput, specs) {
    this.id = id;
    this.name = name;
    this.hasModules = "ModuleInfo" in jsonInput;
    this.specs = specs;
  }
}
