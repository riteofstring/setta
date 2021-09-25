import { useStoreState, useStoreActions } from "easy-peasy";
import { curryAction, defaultState } from "./utils";

export function useIdsOverview(id) {
  const setIdsOverview = curryAction(
    useStoreActions((x) => x.sections.setIdsOverview),
    { sectionId: id },
    "children"
  );
  const idsOverview = defaultState(
    useStoreState((x) => x.sections.idsOverview[id]),
    []
  );
  return [idsOverview, setIdsOverview];
}
