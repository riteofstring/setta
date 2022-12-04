import _ from "lodash";
import { useSectionConfigs } from "models/info/sectionConfigs";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { createManySectionInfo } from "thunks/sections";
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

  const { newInfos, newConfigs } = createManySectionInfo({
    sectionInfoProps: { ...sectionInfoProps, parentId, parentName },
    sectionConfigProps: { uiTypeId },
    numChildren,
  });

  sectionInfosState.setSectionInfo((x) => ({ ...x, ...newInfos }));
  sectionConfigState.setSectionConfig((x) => ({ ...x, ...newConfigs }));

  return _.keys(newInfos);
}
