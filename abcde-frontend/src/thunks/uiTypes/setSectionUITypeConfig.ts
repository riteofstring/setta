import { useUITypes } from "models/info/uiTypes";
import { getSectionInfo, getSectionType } from "thunks/sections/sections";
import { cloneNewUIType, maybeCloneUIType } from "thunks/uiTypes/cloneUITypes";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { initializeParamsOfSectionsWithUITypes } from "../initializeParam";
import { updateUITypeIdOfSectionsWithUITypeId } from "./setSectionUITypeId";

export function setSectionCollections({
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

  useUITypes.getState().setOneConfig({
    uiTypeId: uiType.id,
    configName: "collections",
    newValueFn,
  });
  maybeIncrementProjectStateVersion(incrementVersion);
}

export function maybeCloneSectionUIType({ sectionId, settingPreset }) {
  const {
    name: defaultName,
    nonPresetUITypeIds,
    uiSubType,
  } = getSectionInfo(sectionId);
  const currUIType = getSectionType(sectionId);

  const createNonPreset = () =>
    createNonPresetForSection({ currUIType, defaultName });

  return maybeCloneUIType({
    currUIType,
    currUISubtype: uiSubType,
    settingPreset,
    createNonPreset,
    nonPresetUITypeIds,
  });
}

function createNonPresetForSection({ currUIType, defaultName }) {
  const newUIType = cloneNewUIType({
    uiType: currUIType,
    name: defaultName,
  });
  useUITypes.getState().setUIType({ uiType: newUIType });
  updateUITypeIdOfSectionsWithUITypeId({
    oldUITypeId: currUIType.id,
    newUITypeId: newUIType.id,
  });
  return newUIType;
}
