import { useStoreState, useStoreActions } from "easy-peasy";

import { compatibleName } from "../utils/constants";
import { curryAction, defaultState } from "../utils/utils";
import { useGetSectionType } from "./useCreateInfo";

export function useIdsOverview(id) {
  const idsOverview = useGetIdsOverview(id);
  const setIdsOverview = useSetIdsOverview(id);
  return [idsOverview, setIdsOverview];
}

export function useSetIdsOverview(id) {
  const sectionTypeName = compatibleName(useGetSectionType(id).name);
  return curryAction(
    useStoreActions((x) => x.sectionInfos.setIdsOverview),
    { sectionId: id, sectionTypeName },
    "newStateFn"
  );
}

export function useGetIdsOverview(id) {
  const sectionTypeName = compatibleName(useGetSectionType(id).name);
  return defaultState(
    useStoreState((x) => x.sectionInfos.idsOverview[id]?.[sectionTypeName]),
    () => []
  );
}
