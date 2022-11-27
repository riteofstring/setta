import { maybeNewId } from "utils/utils";

export class ObjInfo {
  constructor({
    id,
    name = "",
    version = null,
    defaultVal = null,
    type = "",
    description = "",
    rcType,
    parentId = null,
    children = [],
  }) {
    this.id = maybeNewId(id);
    this.name = name;
    this.version = version;
    this.defaultVal = defaultVal;
    this.type = type;
    this.rcType = rcType;
    this.description = description;
    this.parentId = parentId;
    this.children = children;
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
