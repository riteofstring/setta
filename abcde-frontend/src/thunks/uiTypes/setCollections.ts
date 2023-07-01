import { initializeParamsOfSectionsWithUITypes } from "../initializeParam";
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
    initializeParamsOfSectionsWithUITypes([uiType.id], [id]);
  }

  setSectionUITypeConfig({
    sectionId,
    configProps: { configName: "collections", newValueFn },
    incrementVersion,
  });
}
