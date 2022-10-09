import { getFullObjPath } from "classes/immutableInfo";
import { useStoreState } from "easy-peasy";
import _ from "lodash";

export function useGroupedObjInfos(ids) {
  const allObjInfo = useStoreState((x) => x.master.allObjInfo);
  const objInfos = ids.map((x) => allObjInfo[x]);
  return _.groupBy(objInfos, (x) => {
    const { path, version } = getFullObjPath(x, 1);
    if (version) {
      return `${path} v${version}`;
    }
    return path;
  });
}
