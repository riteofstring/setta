import { updateParamsAndCallables } from "state/sectionInfos/actions/sectionContents";
import { setSectionInfoAttr } from "state/sectionInfos/actions/setters";
import { maybeIncrementProjectStateVersion } from "../undo";

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
