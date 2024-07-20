import { cloneNewUIType, maybeCloneUIType } from "state/actions/cloneUITypes";
import { setSectionInfoAttr } from "state/actions/setters";
import { useUITypes } from "state/definitions/uiTypes";
import { getSectionInfo, getSectionType } from "state/getters/sectionInfo";
import { setConfigAndChildConfig } from "./setConfigAndChildConfig";
import { setSectionUITypeId } from "./setSectionUITypeId";
import { maybeIncrementProjectStateVersion } from "./undo";

export function setSectionUITypeConfig({
  sectionId,
  settingPreset = false,
  configProps,
  incrementVersion = false,
}) {
  const uiType = maybeCloneSectionUIType({ sectionId, settingPreset });
  setConfigAndChildConfig(uiType, configProps);
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
  useUITypes.getState().setUIType({ uiType: newUIType });
  setSectionInfoAttr({
    sectionId,
    attr: "nonPresetUITypeIds",
    newValueFn: (v) => [...v, newUIType.id],
  });
  return newUIType;
}
