import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { RCType } from "z_utils/types/codeInfo";

export function getAllCollections() {
  return _.pickBy(
    useCodeInfo.getState().x,
    (x) => x.rcType === RCType.COLLECTION
  );
}

export function getKwargIds(objInfoId) {
  const info = useCodeInfo.getState().x;
  return info[objInfoId].children.filter((x) => info[x].editable);
}
