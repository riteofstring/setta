import C from "constants/constants.json";
import _ from "lodash";
import { useCodeInfo } from "state/definitions";

export function getAllCollections() {
  return _.pickBy(useCodeInfo.getState().x, (x) => x.rcType === C.COLLECTION);
}
