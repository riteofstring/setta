import { CodeInfoType } from "abcde-utils/src/types/codeInfo";
import _ from "lodash";

export function groupedObjInfo(infos) {
  return _.groupBy(infos, (x) => {
    return getFullObjPath(x, 1);
  });
}

function getFullObjPath(codeInfo: CodeInfoType, skipLast = 0) {
  if (!codeInfo.path) {
    return codeInfo.name;
  }
  if (skipLast === 0) {
    return codeInfo.path;
  }
  const numDots = codeInfo.path.match(/\./g);
  if (!numDots) {
    return codeInfo.path;
  }
  const regex = new RegExp(`^(?:[^.]*.){${numDots.length - skipLast}}([^.]*)`);
  return codeInfo.path.match(regex)?.[0];
}
