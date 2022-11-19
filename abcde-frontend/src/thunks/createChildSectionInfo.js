import { thunk } from "easy-peasy";
import _ from "lodash";
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

export const createChildSectionInfo = thunk((action, payload, helpers) => {
  const { parentId, numChildren, ...sectionInfoProps } = payload;
  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();

  const { name: parentName, configId } = s.sectionInfos.x[parentId];
  const { uiTypeId: parentUITypeId } = s.sectionConfigs.x[configId];
  const parentUIType = s.uiTypes.x[parentUITypeId];
  const { setUIType, setOneConfig } = a.uiTypes;

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

  a.sectionInfos.setSectionInfo((x) => ({ ...x, ...newInfos }));
  a.sectionConfigs.setSectionConfig((x) => ({ ...x, ...newConfigs }));

  return _.keys(newInfos);
});
