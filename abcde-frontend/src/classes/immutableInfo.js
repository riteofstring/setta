import _ from "lodash";

export class ParameterInfo {
  constructor(jsonInput, parentId) {
    this.id = jsonInput.id;
    this.name = jsonInput.name;
    this.defaultVal = jsonInput.defaultVal;
    this.type = jsonInput.type;
    this.uiTypeName = jsonInput.uiTypeName;
    this.uiTypeConfig = jsonInput.uiTypeConfig;
    this.parentId = parentId;
  }
}

export class ObjInfo {
  constructor(jsonInput, parentId) {
    this.id = jsonInput.id;
    this.name = jsonInput.name;
    this.parentId = parentId;
    this.children = _.mapValues(jsonInput.children, (x) =>
      Object.freeze(new ParameterInfo(x, this.id))
    );
  }
}

export class ModuleInfo {
  constructor(jsonInput, parentId) {
    this.id = jsonInput.id;
    this.name = jsonInput.name;
    this.parentId = parentId;
    this.children = _.mapValues(jsonInput.children, (x) =>
      Object.freeze(new ObjInfo(x, this.id))
    );
  }
}

export class PackageInfo {
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

export class ObjCollectionInfo {
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

export class ParamCollectionInfo extends ObjInfo {
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
