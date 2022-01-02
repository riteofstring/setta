import _ from "lodash";

import { nullOrUndefined } from "../utils/utils";

const { createNewId } = require("../utils/sectionIds");

export function jsonCombiner(available, listOfSelection) {
  if (listOfSelection) {
    const listToAssign = listOfSelection.map((x) => available[x].contents);
    return _.merge({}, ...listToAssign);
  }
  return {};
}

export function createInfo(infoType, ...otherArgs) {
  return (name, jsonInput) => {
    const id = createNewId();
    return {
      id,
      info: Object.freeze(new infoType(id, name, jsonInput, ...otherArgs)),
    };
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

export const convertSpecsToDict = (specs) => {
  if (Array.isArray(specs)) {
    return { objects: specs };
  } else if (nullOrUndefined(specs)) {
    return {};
  }
  return specs;
};

export class ParameterInfo {
  constructor(jsonInput) {
    this.id = jsonInput.id;
    this.name = jsonInput.name;
    this.defaultVal = jsonInput.defaultVal;
    this.type = jsonInput.type;
    this.uiTypeName = jsonInput.uiType;
    this.uiTypeConfig = jsonInput.specs;
  }
}

export class ObjInfo {
  constructor(jsonInput) {
    this.id = jsonInput.id;
    this.name = jsonInput.name;
    this.children = _.mapValues(jsonInput.children, (x) =>
      Object.freeze(new ParameterInfo(x))
    );
  }
}

export class ModuleInfo {
  constructor(jsonInput) {
    this.id = jsonInput.id;
    this.name = jsonInput.name;
    this.children = _.mapValues(jsonInput.children, (x) =>
      Object.freeze(new ObjInfo(x))
    );
  }
}

export class PackageInfo {
  constructor(jsonInput) {
    this.id = jsonInput.id;
    this.name = jsonInput.name;
    this.version = jsonInput.version;
    this.children = _.mapValues(jsonInput.children, (x) =>
      Object.freeze(new ModuleInfo(x))
    );
  }
}

export class AllPackageInfo {
  constructor(jsonInput) {
    this.children = _.mapValues(jsonInput.children, (x) =>
      Object.freeze(new PackageInfo(x))
    );
  }
}

export class ObjCollectionInfo {
  constructor(jsonInput, allObjs) {
    this.id = jsonInput.id;
    this.name = jsonInput.name;
    this.description = jsonInput.description;
    this.children = {};
    jsonInput.children.forEach((x) => (this.children[x] = allObjs[x]));
  }
}

export class AllObjCollectionInfo {
  constructor(jsonInput, allObjs) {
    this.children = _.mapValues(jsonInput.children, (x) =>
      Object.freeze(new ObjCollectionInfo(x, allObjs))
    );
  }
}

export class ParamCollectionInfo extends ObjInfo {
  constructor(id, name, jsonInput) {
    const { description, contents } = jsonInput;
    super(id, name, contents);
    this.description = description;
  }
}

export class AllParamCollectionInfo {
  constructor(available) {
    this.children = getInfos(
      available.parameters,
      createInfo(ParamCollectionInfo)
    );
  }
}
