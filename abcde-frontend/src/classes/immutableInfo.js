export class ObjInfo {
  constructor(jsonInput) {
    this.id = jsonInput.id;
    this.name = jsonInput.name;
    this.version = jsonInput.version;
    this.defaultVal = jsonInput.defaultVal;
    this.type = jsonInput.type;
    this.rcType = jsonInput.rcType;
    this.description = jsonInput.description;
    this.parentId = jsonInput.parentId;
    this.children = jsonInput.children;
  }
}

export function getFullObjPath(objInfo, skipLast = 0) {
  if (skipLast === 0) {
    return { path: objInfo.path, version: objInfo.version };
  }
  const numDots = objInfo.path.match(/\./g);
  if (!numDots) {
    return { path: objInfo.path, version: objInfo.version };
  }
  const regex = new RegExp(`^(?:[^.]*.){${numDots.length - skipLast}}([^.]*)`);
  return {
    path: objInfo.path.match(regex)[0],
    version: objInfo.version,
  };
}
