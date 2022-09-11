import { getFullObjPath } from "classes/immutableInfo";
import { useStoreState } from "easy-peasy";
import _ from "lodash";

export function useGroupedObjInfos(objInfos) {
  const allObjInfo = useStoreState((x) => x.master.allObjInfo);
  return _.groupBy(objInfos, (x) => {
    const { path, version } = getFullObjPath(allObjInfo, x);
    return `${path} v${version}`;
  });
}
