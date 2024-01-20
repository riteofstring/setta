import { updateParamsAndCallables } from "thunks/sections/sectionContents";
import { setSectionInfoAttr } from "thunks/sections/setters";
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
