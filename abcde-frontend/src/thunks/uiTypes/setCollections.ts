import { findAllParameterCollections } from "abcde-utils/src/getDescendants";
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
    const childFinder = findAllParameterCollections;
    if (uiType.config.childUITypeId) {
      initializeParamsOfSectionsWithUITypes(
        [uiType.id, uiType.config.childUITypeId],
        [id],
        childFinder
      );
    } else {
      initializeChildParams(sectionId, [id], childFinder);
    }
  }

  setSectionUITypeConfig({
    sectionId,
    configProps: { configName: "collections", newValueFn },
    incrementVersion,
  });
}
