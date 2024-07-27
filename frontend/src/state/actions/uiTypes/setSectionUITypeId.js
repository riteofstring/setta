import { updateParamsAndCallables } from "state/actions/sections/sectionContents";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
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
