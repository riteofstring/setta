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
import { useUITypes } from "models/info/uiTypes";
import { getChildUITypeId } from "utils/uiTypeUtils";

function maybeGetChildUITypeId(
  uiTypeId,
  parentUIType,
  parentId,
  setUIType,
  setOneConfig
) {
  if (uiTypeId) {
    return uiTypeId;
  }
  return getChildUITypeId(parentUIType, parentId, setUIType, setOneConfig);
}

export function createChildSectionInfo({
  parentId,
  numChildren,
  ...sectionInfoProps
}) {
  const sectionConfigState = useSectionConfigs.getState();
  const uiTypesState = useUITypes.getState();
  const sectionInfosState = useSectionInfos.getState();

  const { name: parentName, configId } = sectionInfosState.x[parentId];
  const { uiTypeId: parentUITypeId } = sectionConfigState.x[configId];
  const parentUIType = uiTypesState.x[parentUITypeId];
  const { setUIType, setOneConfig } = uiTypesState;

  const uiTypeId = maybeGetChildUITypeId(
    sectionInfoProps.uiTypeId,
    parentUIType,
    parentId,
    setUIType,
    setOneConfig
  );

  const newIds = createManySectionInfo({
    sectionInfoProps: { ...sectionInfoProps, parentId, parentName },
    sectionConfigProps: { uiTypeId },
    numChildren,
  });

  return newIds;
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
