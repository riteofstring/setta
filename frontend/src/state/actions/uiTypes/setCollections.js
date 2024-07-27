import { updateManyParamsAndCallables } from "state/actions/sections/sectionContents";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { getSectionIdsWithUITypeIds } from "state/getters/sectionInfo";
import { initializeChildParams } from "../initializeParam";
import {
  maybeCloneSectionUIType,
  setSectionUITypeConfig,
} from "./setSectionUITypeConfig";

export function setCollections({
  sectionId,
  settingPreset = false,
  id,
  checked,
  newValueFn,
  incrementVersion,
}) {
  const uiType = maybeCloneSectionUIType({ sectionId, settingPreset });
  const sectionIds = uiType.config.childUITypeId
    ? getSectionIdsWithUITypeIds(uiType.config.childUITypeId)
    : [];

  sectionIds.push(sectionId);

  if (checked) {
    initializeChildParams({ sectionIds, codeInfoIds: [id] });
  }

  setSectionUITypeConfig({
    sectionId,
    configProps: { configName: "collections", newValueFn },
  });
  updateManyParamsAndCallables(sectionIds);
  maybeIncrementProjectStateVersion(incrementVersion);
}
