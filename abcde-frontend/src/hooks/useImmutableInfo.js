import { getFullObjPath } from "classes/immutableInfo";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";

export function useGroupedObjInfos(ids) {
  const objInfos = useCodeInfo(
    (x) => ids.map((y) => x.allCodeInfo[y]),
    _.isEqual
  );
  return _.groupBy(objInfos, (x) => {
    const { path, version } = getFullObjPath(x, 1);
    if (version) {
      return `${path} v${version}`;
    }
    return path;
  });
}
