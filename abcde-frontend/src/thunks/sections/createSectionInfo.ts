import { DEFAULT_SECTION_UI_TYPE_ID } from "abcde-utils/src/constants";
import { newSectionInfo } from "abcde-utils/src/objs/sectionInfo";
import { ManySectionType } from "abcde-utils/src/types/section";
import _ from "lodash";
import { useKwargCols } from "models/info/kwargCols";
import { useParamInfos } from "models/info/paramInfos";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionDescription } from "models/info/sectionDescription";
import { useSectionInfos } from "models/info/sectionInfos";
import { getChildUITypeId } from "utils/uiTypeUtils";
import { getSectionType } from "./sections";

export function createChildForSeries({ parentId, numChildren }) {
  const { name: parentName } = useSectionInfos.getState().x[parentId];
  const parentUIType = getSectionType(parentId);
  const uiTypeId = getChildUITypeId(parentUIType, parentId);

  return createManySectionInfo({
    sectionProps: { parentId, parentName, uiTypeId },
    numChildren,
  });
}

export function createManySectionInfo({
  sectionProps,
  numChildren = 1,
  isTopLevel = false,
}) {
  const newInfos = {};
  sectionProps["size"] = { width: "auto", height: "auto" };
  for (let i = 0; i < numChildren; i++) {
    const sectionInfo = newSectionInfo(sectionProps);
    newInfos[sectionInfo.id] = sectionInfo;
  }
  addSectionsToState(newInfos, isTopLevel);
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
  isTopLevel: boolean
) {
  const siState = useSectionInfos.getState();
  siState.setSectionInfo((x) => ({ ...x, ...sectionInfos }));

  const sectionIds = _.map(sectionInfos, (x) => x.id);
  siState.initManyAllChildren({ sectionIds });
  siState.initManyCurrChildren({ sectionIds });

  useParamInfos.getState().initManyEvColIds({
    collectionIds: _.map(sectionInfos, (x) => x.evColId),
  });

  useParamInfos.getState().initManyUITypeColIds({
    collectionIds: _.map(sectionInfos, (x) => x.uiTypeColId),
  });

  useKwargCols.getState().initManyKwargColIds({
    collectionIds: _.map(sectionInfos, (x) => x.kwargColId),
  });

  useSectionDescription.getState().initDescriptions({
    descriptionIds: _.map(sectionInfos, (x) => x.descriptionId),
  });

  if (isTopLevel) {
    useProjectConfig.getState().addChildren(sectionIds);
  }
}
