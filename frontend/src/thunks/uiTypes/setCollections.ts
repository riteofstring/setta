import { updateManyParamsAndCallables } from "state/sectionInfos/actions/sectionContents";
import { getSectionIdsWithUITypeIds } from "state/sectionInfos/getters";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { initializeChildParams } from "../../state/codeInfo/actions/initializeParam";
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
