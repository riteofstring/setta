import { isRoot, isSeriesElement } from "abcde-utils/src/constants";
import { useUITypes } from "models/info/uiTypes";
import {
  getSectionInfo,
  getSectionType,
  setSectionInfoAttr,
} from "thunks/sections/sections";
import { cloneNewUIType, maybeCloneUIType } from "thunks/uiTypes/cloneUITypes";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { initializeParamsOfSectionsWithUITypes } from "../initializeParam";
import {
  setSectionUITypeId,
  updateUITypeIdOfSectionsWithUITypeId,
} from "./setSectionUITypeId";

export function setSectionCollections({
  sectionId,
  settingPreset = false,
  id,
  checked,
  newValueFn,
  incrementVersion,
}) {
  const uiType = maybeCloneSectionUIType({ sectionId, settingPreset });

  console.log("uiType", uiType);

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

function maybeCloneSectionUIType({ sectionId, settingPreset }) {
  const {
    name: defaultName,
    nonPresetUITypeIds,
    uiSubType,
  } = getSectionInfo(sectionId);
  const currUIType = getSectionType(sectionId);

  const createNonPreset = () =>
    createNonPresetForSection({
      sectionId,
      currUIType,
      defaultName,
      uiSubType,
    });

  return maybeCloneUIType({
    currUIType,
    currUISubtype: uiSubType,
    settingPreset,
    createNonPreset,
    nonPresetUITypeIds,
  });
}

function createNonPresetForSection({
  sectionId,
  currUIType,
  defaultName,
  uiSubType,
}) {
  const newUIType = cloneNewUIType({
    uiType: currUIType,
    uiSubType,
    name: defaultName,
  });
  useUITypes.getState().setUIType({ uiType: newUIType });

  if (isRoot(currUIType.type) && !isSeriesElement(uiSubType)) {
    updateUITypeIdOfSectionsWithUITypeId({
      oldUITypeId: currUIType.id,
      newUITypeId: newUIType.id,
    });
  } else {
    setSectionInfoAttr({
      sectionId,
      attr: "nonPresetUITypeIds",
      newValueFn: (v) => [...v, newUIType.id],
    });
    setSectionUITypeId({ uiTypeId: newUIType.id, sectionId });
  }

  return newUIType;
}
