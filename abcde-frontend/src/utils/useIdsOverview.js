import { useStoreActions } from "easy-peasy";

import { useIsEqual } from "./useCreateInfo";
import { curryAction, defaultState } from "./utils";

export function useIdsOverview(id) {
  const setIdsOverview = curryAction(
    useStoreActions((x) => x.sectionInfos.setIdsOverview),
    { sectionId: id },
    "newStateFn"
  );
  const idsOverview = defaultState(
    useIsEqual((x) => x.sectionInfos.idsOverview[id]),
    () => []
  );
  return [idsOverview, setIdsOverview];
}
