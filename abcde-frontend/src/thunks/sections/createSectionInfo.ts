import { DEFAULT_SECTION_UI_TYPE_ID } from "abcde-utils/src/constants";
import { findAllParameterCollections } from "abcde-utils/src/getDescendants";
import { newSectionInfo } from "abcde-utils/src/objs/sectionInfo";
import { ManySectionType } from "abcde-utils/src/types/section";
import { SectionPositionType } from "abcde-utils/src/types/sectionPosition";
import _ from "lodash";
import { useKwargCols } from "models/info/kwargCols";
import { useParamInfos } from "models/info/paramInfos";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { initializeChildParams } from "thunks/initializeParam";
import { getUISubType } from "thunks/uiTypes/getUISubType";
import { getSectionType, getSectionTypeConfig } from "./sections";

export function createChildForSeries({ parentId, numChildren }) {
  const { name } = useSectionInfos.getState().x[parentId];
  const parentUIType = getSectionType(parentId);
  const uiSubType = getUISubType(parentUIType);

  return createManySectionInfo({
    sectionProps: {
      parentId,
      name,
      uiTypeId: parentUIType.id,
      uiSubType,
    },
    numChildren,
  });
}

export function createManySectionInfo({
  sectionProps,
  numChildren = 1,
  topLevelPosition = null,
}) {
  const newInfos = {};
  sectionProps["size"] = { width: "auto", height: "auto" };
  for (let i = 0; i < numChildren; i++) {
    const sectionInfo = newSectionInfo(sectionProps);
    newInfos[sectionInfo.id] = sectionInfo;
  }
  addSectionsToState(newInfos, topLevelPosition);
  return Object.keys(newInfos);
}

export function createDefaultSectionInfo({ sectionProps, ...props }) {
  return createManySectionInfo({
    sectionProps: {
      name: "New Section",
      uiTypeId: DEFAULT_SECTION_UI_TYPE_ID,
      ...sectionProps,
    },
    ...props,
  });
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
    initializeChildParams(s, collections, findAllParameterCollections);
  }

  useKwargCols.getState().initManyKwargColIds({
    collectionIds: _.map(sectionInfos, (x) => x.kwargColId),
  });

  if (topLevelPosition) {
    useProjectConfig
      .getState()
      .addChildren(_.mapValues(sectionInfos, () => topLevelPosition));
  }
}
