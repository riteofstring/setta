import { DEFAULT_SECTION_UI_TYPE_ID } from "abcde-utils/src/constants";
import { newSectionConfig } from "abcde-utils/src/objs/sectionConfig";
import { newSectionInfo } from "abcde-utils/src/objs/sectionInfo";
import { ManySectionType } from "abcde-utils/src/types/section";
import { ManySectionConfigType } from "abcde-utils/src/types/sectionConfig";
import _ from "lodash";
import { useKwargCols } from "models/info/kwargCols";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionConfigs } from "models/info/sectionConfigs";
import { useSectionInfos } from "models/info/sectionInfos";
import { getChildUITypeId } from "utils/uiTypeUtils";
import { getSectionType } from "./sections";

export function createChildForSeries({ parentId, numChildren }) {
  const { name: parentName } = useSectionInfos.getState().x[parentId];
  const parentUIType = getSectionType(parentId);
  const uiTypeId = getChildUITypeId(parentUIType, parentId);

  return createManySectionInfo({
    sectionInfoProps: { parentId, parentName },
    sectionConfigProps: { uiTypeId },
    numChildren,
  });
}

export function createManySectionInfo({
  sectionInfoProps,
  sectionConfigProps,
  numChildren,
}) {
  const newInfos = {};
  const newConfigs = {};
  for (let i = 0; i < numChildren; i++) {
    const sectionInfo = newSectionInfo(sectionInfoProps);
    newInfos[sectionInfo.id] = sectionInfo;
    newConfigs[sectionInfo.configId] = newSectionConfig({
      id: sectionInfo.configId,
      ...sectionConfigProps,
    });
  }
  addSectionsToState(newInfos, newConfigs);
  return Object.keys(newInfos);
}

export function createDefaultSectionInfo({ sectionProps, configProps }) {
  const sectionInfo = newSectionInfo({
    name: "New Section",
    ...sectionProps,
  });
  const sectionConfig = newSectionConfig({
    id: sectionInfo.configId,
    uiTypeId: DEFAULT_SECTION_UI_TYPE_ID,
    ...configProps,
  });

  addSectionsToState(
    { [sectionInfo.id]: sectionInfo },
    { [sectionConfig.id]: sectionConfig }
  );

  return [sectionInfo.id];
}

export function addSectionsToState(
  sectionInfos: ManySectionType,
  sectionConfigs: ManySectionConfigType
) {
  const siState = useSectionInfos.getState();
  siState.setSectionInfo((x) => ({ ...x, ...sectionInfos }));

  const sectionIds = _.map(sectionInfos, (x) => x.id);
  siState.initManyAllChildren({ sectionIds });
  siState.initManyCurrChildren({ sectionIds });

  useSectionConfigs.getState().setSectionConfig((x) => ({
    ...x,
    ...sectionConfigs,
  }));

  useParamInfos.getState().initManyEvColIds({
    collectionIds: _.map(sectionConfigs, (x) => x.evColId),
  });

  useKwargCols.getState().initManyKwargColIds({
    collectionIds: _.map(sectionConfigs, (x) => x.kwargColId),
  });
}
