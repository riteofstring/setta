import { getFullObjPath } from "classes/immutableInfo";
import { useStoreState } from "easy-peasy";
import _ from "lodash";

export function useGroupedObjInfos(ids) {
  const objInfos = useStoreState(
    (x) => ids.map((y) => x.codeInfo.allCodeInfo[y]),
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
