import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import {
  cloneNewUIType,
  maybeCloneUIType,
} from "state/actions/uiTypes/cloneUITypes";
import { getSectionInfo, getSectionType } from "state/getters/sectionInfo";
import { maybeIncrementProjectStateVersion } from "../undo";
import { setSectionUITypeId } from "./setSectionUITypeId";
import { addUIType, setOneUITypeConfig } from "./uiTypes";

export function setSectionUITypeConfig({
  sectionId,
  settingPreset = false,
  configProps,
  incrementVersion = false,
}) {
  const uiType = maybeCloneSectionUIType({ sectionId, settingPreset });
  setOneUITypeConfig({ uiTypeId: uiType.id, ...configProps });
  maybeIncrementProjectStateVersion(incrementVersion);
}

export function maybeCloneSectionUIType({ sectionId, settingPreset }) {
  const { name: defaultName, nonPresetUITypeIds } = getSectionInfo(sectionId);
  const currUIType = getSectionType(sectionId);

  const setUITypeId = (uiTypeId) => setSectionUITypeId({ uiTypeId, sectionId });
  const createNonPreset = () =>
    createNonPresetForSection({ sectionId, currUIType, defaultName });

  return maybeCloneUIType({
    currUIType,
    settingPreset,
    createNonPreset,
    nonPresetUITypeIds,
    setUITypeId,
  });
}

function createNonPresetForSection({ sectionId, currUIType, defaultName }) {
  const newUIType = cloneNewUIType({
    uiType: currUIType,
    name: defaultName,
  });
  addUIType({ uiType: newUIType });
  setSectionInfoAttr({
    sectionId,
    attr: "nonPresetUITypeIds",
    newValueFn: (v) => [...v, newUIType.id],
  });
  return newUIType;
}
