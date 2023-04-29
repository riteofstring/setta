import _ from "lodash";
import { getFullObjPath } from "utils/getFullObjPath";

export function useGroupedObjInfos(details) {
  return _.groupBy(details, (x) => {
    const { path, version } = getFullObjPath(x, 1);
    if (version) {
      return `${path} v${version}`;
    }
    return path;
  });
}
