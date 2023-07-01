import { useUITypes } from "models/info/uiTypes";
import {
  getSectionInfo,
  getSectionType,
  setSectionInfoAttr,
} from "thunks/sections/sections";
import { cloneNewUIType, maybeCloneUIType } from "thunks/uiTypes/cloneUITypes";
import { maybeIncrementProjectStateVersion } from "../undo";
import { updateUITypeIdOfSectionsWithUITypeId } from "./setSectionUITypeId";

export function setSectionUITypeConfig({
  sectionId,
  settingPreset = false,
  configProps,
  incrementVersion = false,
}) {
  const uiType = maybeCloneSectionUIType({ sectionId, settingPreset });
  useUITypes.getState().setOneConfig({ uiTypeId: uiType.id, ...configProps });
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
    createNonPresetForSection({ sectionId, currUIType, defaultName });

  return maybeCloneUIType({
    currUIType,
    currUISubtype: uiSubType,
    settingPreset,
    createNonPreset,
    nonPresetUITypeIds,
  });
}

function createNonPresetForSection({ sectionId, currUIType, defaultName }) {
  const newUIType = cloneNewUIType({
    uiType: currUIType,
    name: defaultName,
  });
  useUITypes.getState().setUIType({ uiType: newUIType });
  setSectionInfoAttr({
    sectionId,
    attr: "nonPresetUITypeIds",
    newValueFn: (v) => [...v, newUIType.id],
  });
  updateUITypeIdOfSectionsWithUITypeId({
    oldUITypeId: currUIType.id,
    newUITypeId: newUIType.id,
  });
  return newUIType;
}
