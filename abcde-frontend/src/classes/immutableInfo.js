import _ from "lodash";

export class ObjInfo {
  constructor(jsonInput) {
    this.id = jsonInput.id;
    this.name = jsonInput.name;
    this.version = jsonInput.version;
    this.defaultVal = jsonInput.defaultVal;
    this.type = jsonInput.type;
    this.rel = jsonInput.rel;
    this.parentId = jsonInput.parentId;
    this.children = jsonInput.children;
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

export function getFullObjPath(allObjInfo, objInfo) {
  let currObjInfo = objInfo;
  let path = currObjInfo.name;
  while (currObjInfo.parentId) {
    currObjInfo = allObjInfo[currObjInfo.parentId];
    path = `${currObjInfo.name}.${path}`;
  }
  return { path, version: currObjInfo.version };
}

export const NULL_OBJ_INFO = Object.freeze(
  new ObjInfo({ id: null, name: null, children: {} })
);
