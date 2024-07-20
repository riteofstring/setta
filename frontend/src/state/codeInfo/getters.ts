import C from "constants/constants.json";
import _ from "lodash";
import { useCodeInfo } from "state/codeInfo/definition";

export function getAllCollections() {
  return _.pickBy(useCodeInfo.getState().x, (x) => x.rcType === C.COLLECTION);
}

export function getKwargIds(objInfoId) {
  const info = useCodeInfo.getState().x;
  return info[objInfoId].children.filter((x) => info[x].editable);
}
