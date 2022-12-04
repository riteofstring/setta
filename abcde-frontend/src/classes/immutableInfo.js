import { maybeNewId } from "utils/utils";

export class CodeInfo {
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

export function getFullObjPath(codeInfo, skipLast = 0) {
  if (skipLast === 0) {
    return { path: codeInfo.path, version: codeInfo.version };
  }
  const numDots = codeInfo.path.match(/\./g);
  if (!numDots) {
    return { path: codeInfo.path, version: codeInfo.version };
  }
  const regex = new RegExp(`^(?:[^.]*.){${numDots.length - skipLast}}([^.]*)`);
  return {
    path: codeInfo.path.match(regex)[0],
    version: codeInfo.version,
  };
}
