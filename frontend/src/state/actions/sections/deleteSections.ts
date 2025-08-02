import { useProjectState } from "state/definitions";
import { maybeIncrementProjectStateVersion } from "../undo";

export function deleteAllActiveSections() {
  const sectionIds = useProjectState.getState().activeIds;
  useProjectState.setState((state) => {
    deleteSections(sectionIds, state);
  });
  maybeIncrementProjectStateVersion(true);
}
