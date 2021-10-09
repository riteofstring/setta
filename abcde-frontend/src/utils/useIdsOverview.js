import { useStoreState, useStoreActions } from "easy-peasy";

import { compatibleName } from "./constants";
import { useGetSectionType } from "./useCreateInfo";
import { curryAction, defaultState } from "./utils";

export function useIdsOverview(id) {
  const sectionTypeName = compatibleName(useGetSectionType(id).name);

  const setIdsOverview = curryAction(
    useStoreActions((x) => x.sectionInfos.setIdsOverview),
    { sectionId: id, sectionTypeName },
    "newStateFn"
  );
  const idsOverview = defaultState(
    useStoreState((x) => x.sectionInfos.idsOverview[id])?.[sectionTypeName],
    () => []
  );
  return [idsOverview, setIdsOverview];
}
