import { maybeNewId } from "utils/utils";

export function newCodeInfo({
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
  return {
    id: maybeNewId(id),
    name,
    version,
    defaultVal,
    type,
    rcType,
    description,
    parentId,
    children,
  };
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
