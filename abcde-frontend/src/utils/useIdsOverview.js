import { useStoreState, useStoreActions } from "easy-peasy";

import { curryAction, defaultState } from "./utils";

export function useIdsOverview(id) {
  const setIdsOverview = curryAction(
    useStoreActions((x) => x.sectionInfos.setIdsOverview),
    { sectionId: id },
    "newStateFn"
  );
  const idsOverview = defaultState(
    useStoreState((x) => x.sectionInfos.idsOverview[id]),
    []
  );
  return [idsOverview, setIdsOverview];
}
