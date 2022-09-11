import _ from "lodash";
import { CALLABLE, COLLECTION } from "utils/constants";

export function createAllInfo(packages) {
  const allObjInfo = packages;
  const allCollections = _.pickBy(allObjInfo, (v) => v.type === COLLECTION);
  for (let c of Object.values(allCollections)) {
    c.requiresSearch = c.children
      .map((x) => allObjInfo[x].type === CALLABLE)
      .some((x) => x === true);
  }
  return { allObjInfo, allCollections };
}
