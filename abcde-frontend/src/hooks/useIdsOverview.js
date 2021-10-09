import { useStoreState, useStoreActions } from "easy-peasy";

import { compatibleName } from "../utils/constants";
import { curryAction, defaultState } from "../utils/utils";
import { useGetSectionType } from "./useCreateInfo";

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
