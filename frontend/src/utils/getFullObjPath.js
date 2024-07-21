import _ from "lodash";

export function groupedObjInfo(infos) {
  return _.groupBy(infos, (x) => {
    return getFullObjPath(x, 1);
  });
}

function getFullObjPath(codeInfo, skipLast = 0) {
  if (skipLast === 0) {
    return codeInfo.name;
  }
  const numDots = codeInfo.name.match(/\./g);
  if (!numDots) {
    return codeInfo.name;
  }
  const regex = new RegExp(`^(?:[^.]*.){${numDots.length - skipLast}}([^.]*)`);
  return codeInfo.name.match(regex)?.[0];
}
