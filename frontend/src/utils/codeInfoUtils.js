import _ from "lodash";

export function assembleCollectionsForSectionConfig(allCodeInfo, collections) {
  // keep only necessary keys
  const results = _.mapValues(collections, (x) =>
    _.pick(x, ["id", "name", "description", "path", "children"]),
  );
  // re-assign children to be list of objects instead of list of ids
  _.forEach(results, (v) => {
    v["children"] = v["children"].map((x) =>
      _.pick(allCodeInfo[x], ["id", "name", "path"]),
    );
  });
  return results;
}

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
