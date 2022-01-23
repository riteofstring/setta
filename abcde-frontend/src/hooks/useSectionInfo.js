import { useStoreState } from "easy-peasy";
import { defaultState } from "utils/utils";

import { getInfo } from "./utils";

export function useGetSectionInfo(sectionId) {
  return defaultState(
    useStoreState((x) => getInfo(x.sectionInfos)[sectionId]),
    () => ({})
  );
}
