import { updateCurrChildren } from "thunks/sections/children";
import { getSectionInfo } from "thunks/sections/getters";
import { updateParamsAndCallables } from "thunks/sections/sectionContents";
import { setSectionInfoAttr } from "thunks/sections/setters";
import { maybeIncrementProjectStateVersion } from "../undo";
import { setParamUITypeId } from "./setParamUITypeId";

export function setSectionUITypeId({
  uiTypeId,
  sectionId,
  incrementVersion = false,
}) {
  const { parentId, paramInfoId } = getSectionInfo(sectionId);

  setSectionInfoAttr({
    sectionId,
    attr: "uiTypeId",
    value: uiTypeId,
  });

  if (paramInfoId) {
    setParamUITypeId({
      sectionId: parentId,
      paramInfoId,
      uiTypeId,
      doInitializeChild: false,
    });
  }

  updateParamsAndCallables(sectionId);
  updateCurrChildren(sectionId);

  maybeIncrementProjectStateVersion(incrementVersion);
}
