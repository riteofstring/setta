import { RCType } from "abcde-utils/src/types/codeInfo";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";

export function getAllCollections() {
  return _.pickBy(
    useCodeInfo.getState().allCodeInfo,
    (x) => x.rcType === RCType.COLLECTION
  );
}
