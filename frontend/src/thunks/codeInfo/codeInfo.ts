import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { C } from "utils/constants";

export function getAllCollections() {
  return _.pickBy(useCodeInfo.getState().x, (x) => x.rcType === C.COLLECTION);
}

export function getKwargIds(objInfoId) {
  const info = useCodeInfo.getState().x;
  return info[objInfoId].children.filter((x) => info[x].editable);
}
