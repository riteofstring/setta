import {
  INDEPENDENT_SERIES_ELEMENT,
  isDependentSeriesElement,
  isSeriesRoot,
} from "abcde-utils/src/constants";
import _ from "lodash";
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
    name: defaultName,
  });
  useUITypes.getState().setUIType({ uiType: newUIType });

  if (isSeriesRoot(currUIType.type, uiSubType)) {
    updateUITypeIdOfSectionsWithUITypeId({
      oldUITypeId: currUIType.id,
      newUITypeId: newUIType.id,
    });
  } else {
    setSectionInfoAttr({
      sectionId,
      attr: "nonPresetUITypeIds",
      newValueFn: (v) =>
        _.filter([...v, newUIType.id], (x) => x !== currUIType.id),
    });
    setSectionUITypeId({ uiTypeId: newUIType.id, sectionId });
    if (isDependentSeriesElement(uiSubType)) {
      setSectionInfoAttr({
        sectionId,
        attr: "uiSubType",
        value: INDEPENDENT_SERIES_ELEMENT,
      });
    }
  }

  return newUIType;
}
