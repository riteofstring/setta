export class ObjInfo {
  constructor(jsonInput) {
    this.id = jsonInput.id;
    this.name = jsonInput.name;
    this.version = jsonInput.version;
    this.defaultVal = jsonInput.defaultVal;
    this.type = jsonInput.type;
    this.rel = jsonInput.rel;
    this.description = jsonInput.description;
    this.requiresSearch = jsonInput.requiresSearch;
    this.parentId = jsonInput.parentId;
    this.children = jsonInput.children;
  }
}

export function getFullObjPath(allObjInfo, objInfo, skipLast = 0) {
  let currObjInfo = objInfo;
  let path = [currObjInfo.name];
  while (currObjInfo.parentId) {
    currObjInfo = allObjInfo[currObjInfo.parentId];
    path.push(currObjInfo.name);
  }
  if (path.length > skipLast) {
    path = path.slice(skipLast);
  }
  path = path.reverse().join(".");
  return { path, version: currObjInfo.version };
}
