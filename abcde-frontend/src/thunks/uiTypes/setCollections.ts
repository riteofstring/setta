import {
  initializeChildParams,
  initializeParamsOfSectionsWithUITypes,
} from "../initializeParam";
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

  if (checked) {
    if (uiType.config.childUITypeId) {
      initializeParamsOfSectionsWithUITypes(
        [uiType.id, uiType.config.childUITypeId],
        [id]
      );
    } else {
      initializeChildParams(sectionId, [id]);
    }
  }

  setSectionUITypeConfig({
    sectionId,
    configProps: { configName: "collections", newValueFn },
    incrementVersion,
  });
}
