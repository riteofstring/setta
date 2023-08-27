import { newSectionInfo } from "abcde-utils/src/objs/sectionInfo";
import { ManySectionType } from "abcde-utils/src/types/section";
import { SectionPositionType } from "abcde-utils/src/types/sectionPosition";
import _ from "lodash";
import { useParamInfos } from "models/info/paramInfos";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { initializeChildParams } from "thunks/initializeParam";
import { getChildUIType } from "thunks/uiTypes/getChildUITypeId";
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
  topLevelPosition = null,
}) {
  const newInfos = {};
  sectionProps["size"] = { width: "auto", height: "auto" };
  for (let i = 0; i < numSections; i++) {
    const sectionInfo = newSectionInfo(sectionProps);
    newInfos[sectionInfo.id] = sectionInfo;
  }
  addSectionsToState(newInfos, topLevelPosition);
  return Object.keys(newInfos);
}

export function addSectionsToState(
  sectionInfos: ManySectionType,
  topLevelPosition: SectionPositionType | null
) {
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
    const { collections } = getSectionTypeConfig(s);
    initializeChildParams([s], collections);
  }

  if (topLevelPosition) {
    useProjectConfig
      .getState()
      .addChildren(_.mapValues(sectionInfos, () => topLevelPosition));
  }
}
