import { CodeInfoType } from "abcde-utils/src/types/codeInfo";

export function getFullObjPath(codeInfo: CodeInfoType, skipLast = 0) {
  if (skipLast === 0) {
    return { path: codeInfo.path, version: codeInfo.version };
  }
  const numDots = codeInfo.path.match(/\./g);
  if (!numDots) {
    return { path: codeInfo.path, version: codeInfo.version };
  }
  const regex = new RegExp(`^(?:[^.]*.){${numDots.length - skipLast}}([^.]*)`);
  return {
    path: codeInfo.path.match(regex)?.[0],
    version: codeInfo.version,
  };
}
