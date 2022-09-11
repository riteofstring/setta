import _ from "lodash";
import { COLLECTION } from "utils/constants";

export function createAllInfo(packages) {
  const allObjInfo = Object.freeze(packages);
  const allCollections = _.pickBy(allObjInfo, (v) => v.type === COLLECTION);
  return { allObjInfo, allCollections };
}
