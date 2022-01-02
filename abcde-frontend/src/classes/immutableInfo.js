import _ from "lodash";

export class ParameterInfo {
  constructor(jsonInput) {
    this.id = jsonInput.id;
    this.name = jsonInput.name;
    this.defaultVal = jsonInput.defaultVal;
    this.type = jsonInput.type;
    this.uiTypeName = jsonInput.uiTypeName;
    this.uiTypeConfig = jsonInput.uiTypeConfig;
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
