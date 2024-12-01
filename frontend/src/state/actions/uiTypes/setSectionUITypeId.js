import { useSectionInfos } from "state/definitions";
import { maybeIncrementProjectStateVersion } from "../undo";

export function setSectionUITypeId({
  uiTypeId,
  sectionId,
  incrementVersion = false,
}) {
  useSectionInfos.setState((state) => {
    state.x[sectionId].uiTypeId = uiTypeId;
  });

  maybeIncrementProjectStateVersion(incrementVersion);
}
