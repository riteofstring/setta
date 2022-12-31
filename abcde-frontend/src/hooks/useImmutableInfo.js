import { getFullObjPath } from "classes/immutableInfo";
import _ from "lodash";

export function useGroupedObjInfos(details) {
  return _.groupBy(details, (x) => {
    const { path, version } = getFullObjPath(x, 1);
    if (version) {
      return `${path} v${version}`;
    }
    return path;
  });
}
