import { RCType } from "abcde-utils/src/types/codeInfo";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";

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
