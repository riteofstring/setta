import { updateParamsAndCallables } from "state/actions/sectionContents";
import { setSectionInfoAttr } from "state/actions/setters";
import { maybeIncrementProjectStateVersion } from "../../state/actions/undo";

export function setSectionUITypeId({
  uiTypeId,
  sectionId,
  incrementVersion = false,
}) {
  setSectionInfoAttr({
    sectionId,
    attr: "uiTypeId",
    value: uiTypeId,
  });

  updateParamsAndCallables(sectionId);

  maybeIncrementProjectStateVersion(incrementVersion);
}
