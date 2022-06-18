import _ from "lodash";

export class ParameterInfo {
  constructor(jsonInput, parentId) {
    this.id = jsonInput.id;
    this.name = jsonInput.name;
    this.defaultVal = jsonInput.defaultVal;
    this.type = jsonInput.type;
    this.parentId = parentId;
  }
}

class ObjInfo {
  constructor(jsonInput, parentId) {
    this.id = jsonInput.id;
    this.name = jsonInput.name;
    this.parentId = parentId;
    this.children = _.mapValues(jsonInput.children, (x) =>
      Object.freeze(new ParameterInfo(x, this.id))
    );
  }
}

class ModuleInfo {
  constructor(jsonInput, parentId) {
    this.id = jsonInput.id;
    this.name = jsonInput.name;
    this.parentId = parentId;
    this.children = _.mapValues(jsonInput.children, (x) =>
      Object.freeze(new ObjInfo(x, this.id))
    );
  }
}

class PackageInfo {
  constructor(jsonInput) {
    this.id = jsonInput.id;
    this.name = jsonInput.name;
    this.version = jsonInput.version;
    this.children = _.mapValues(jsonInput.children, (x) =>
      Object.freeze(new ModuleInfo(x, this.id))
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

class ObjCollectionInfo {
  constructor(jsonInput, allObjInfo) {
    this.id = jsonInput.id;
    this.name = jsonInput.name;
    this.description = jsonInput.description;
    this.children = {};
    jsonInput.children.forEach((x) => (this.children[x] = allObjInfo[x]));
  }
}

export class AllObjCollectionInfo {
  constructor(jsonInput, allObjInfo) {
    this.children = _.mapValues(jsonInput.children, (x) =>
      Object.freeze(new ObjCollectionInfo(x, allObjInfo))
    );
  }
}

class ParamCollectionInfo extends ObjInfo {
  constructor(jsonInput) {
    super(jsonInput);
    this.description = jsonInput.description;
  }
}

export class AllParamCollectionInfo {
  constructor(jsonInput) {
    this.children = _.mapValues(jsonInput.children, (x) =>
      Object.freeze(new ParamCollectionInfo(x))
    );
  }
}

export function getFullObjPath(allPackageInfo, allModuleInfo, objInfo) {
  const objName = objInfo.name;
  const moduleInfo = allModuleInfo[objInfo.parentId];
  const moduleName = moduleInfo.name;
  const packageName = allPackageInfo.children[moduleInfo.parentId].name;
  return `${packageName}.${moduleName}.${objName}`;
}

export const NULL_OBJ_INFO = Object.freeze(
  new ObjInfo({ id: null, name: null, children: {} }, null)
);
