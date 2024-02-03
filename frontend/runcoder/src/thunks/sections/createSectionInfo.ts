import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { initializeChildParams } from "thunks/initializeParam";
import { getChildUIType } from "thunks/uiTypes/getChildUITypeId";
import { setSectionUITypeConfig } from "thunks/uiTypes/setSectionUITypeConfig";
import { newCodeInfo } from "z_utils/objs/codeInfo";
import { newSectionInfo } from "z_utils/objs/sectionInfo";
import { RCType } from "z_utils/types/codeInfo";
import { ManySectionType } from "z_utils/types/section";
import { getSectionType, getSectionTypeConfig } from "./getters";

export function createChildForSeries({ parentId, numChildren }) {
  const { name: parentName } = useSectionInfos.getState().x[parentId];
  const parentUIType = getSectionType(parentId);
  const uiType = getChildUIType(parentUIType, parentId);
  const nonPresetUITypeIds = !uiType.presetType ? [uiType.id] : [];

  return createSectionInfo({
    sectionProps: {
      parentId,
      parentName,
      uiTypeId: uiType.id,
      nonPresetUITypeIds,
    },
    numSections: numChildren,
  });
}

export function createSectionInfo({
  sectionProps = {},
  numSections = 1,
  isTopLevel = false,
}) {
  const newInfos = {};
  for (let i = 0; i < numSections; i++) {
    const sectionInfo = newSectionInfo(sectionProps);
    newInfos[sectionInfo.id] = sectionInfo;
  }
  addSectionsToState(newInfos, isTopLevel);
  return Object.keys(newInfos);
}

function addSectionsToState(sectionInfos: ManySectionType, isTopLevel) {
  const siState = useSectionInfos.getState();
  siState.setSectionInfo((x) => ({ ...x, ...sectionInfos }));

  const sectionIds = _.map(sectionInfos, (x) => x.id);

  useParamInfos.getState().initManyEvColIds({
    collectionIds: _.map(sectionInfos, (x) => x.evColId),
  });

  useParamInfos.getState().initManyUITypeColIds({
    collectionIds: _.map(sectionInfos, (x) => x.uiTypeColId),
  });

  for (const s of sectionIds) {
    initializeNewSectionConfig(s);
    const { codeInfoId } = getSectionTypeConfig(s);
    initializeChildParams({ sectionIds: [s], codeInfoIds: [codeInfoId] });
  }

  if (isTopLevel) {
    useProjectConfig.getState().addChildren(Object.keys(sectionInfos));
  }
}

function initializeNewSectionConfig(sectionId) {
  const collection = newCodeInfo({
    name: "Contents",
    rcType: RCType.COLLECTION,
  });
  useCodeInfo.getState().addCodeInfo({ info: collection });
  setSectionUITypeConfig({
    sectionId,
    configProps: {
      configName: "codeInfoId",
      newValueFn: () => collection.id,
    },
  });
}
