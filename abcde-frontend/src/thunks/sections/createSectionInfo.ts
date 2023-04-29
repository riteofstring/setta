import { DEFAULT_SECTION_UI_TYPE_ID } from "abcde-utils/src/constants";
import { newSectionConfig } from "abcde-utils/src/objs/sectionConfig";
import { newSectionInfo } from "abcde-utils/src/objs/sectionInfo";
import { ManySectionType } from "abcde-utils/src/types/section";
import { ManySectionConfigType } from "abcde-utils/src/types/sectionConfig";
import _ from "lodash";
import { useKwargCols } from "models/info/kwargCols";
import { useParamInfos } from "models/info/paramInfos";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionConfigs } from "models/info/sectionConfigs";
import { useSectionDescription } from "models/info/sectionDescription";
import { useSectionInfos } from "models/info/sectionInfos";
import { getChildUITypeId } from "utils/uiTypeUtils";

export function createChildForSeries({ parentId, numChildren }) {
  const { name: parentName } = useSectionInfos.getState().x[parentId];
  const uiTypeId = getChildUITypeId(parentId);

  return createManySectionInfo({
    sectionProps: { parentId, parentName },
    configProps: { uiTypeId },
    numChildren,
  });
}

export function createManySectionInfo({
  sectionProps,
  configProps,
  numChildren = 1,
  isTopLevel = false,
}) {
  const newInfos = {};
  const newConfigs = {};
  sectionProps["size"] = { width: "auto", height: "auto" };
  for (let i = 0; i < numChildren; i++) {
    const sectionInfo = newSectionInfo(sectionProps);
    newInfos[sectionInfo.id] = sectionInfo;
    newConfigs[sectionInfo.configId] = newSectionConfig({
      id: sectionInfo.configId,
      ...configProps,
    });
  }
  addSectionsToState(newInfos, newConfigs, isTopLevel);
  return Object.keys(newInfos);
}

export function createDefaultSectionInfo({
  sectionProps,
  configProps,
  ...props
}) {
  return createManySectionInfo({
    sectionProps: {
      name: "New Section",
      ...sectionProps,
    },
    configProps: {
      uiTypeId: DEFAULT_SECTION_UI_TYPE_ID,
      ...configProps,
    },
    ...props,
  });
}

export function addSectionsToState(
  sectionInfos: ManySectionType,
  sectionConfigs: ManySectionConfigType,
  isTopLevel: boolean
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

  useParamInfos.getState().initManyUITypeColIds({
    collectionIds: _.map(sectionConfigs, (x) => x.uiTypeColId),
  });

  useKwargCols.getState().initManyKwargColIds({
    collectionIds: _.map(sectionConfigs, (x) => x.kwargColId),
  });

  useSectionDescription.getState().initDescriptions({
    descriptionIds: _.map(sectionConfigs, (x) => x.descriptionId),
  });

  if (isTopLevel) {
    useProjectConfig.getState().addChildren(sectionIds);
  }
}
