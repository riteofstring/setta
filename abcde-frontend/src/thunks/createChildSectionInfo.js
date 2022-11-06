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

  const { name: parentName, configId } =
    helpers.getStoreState().sectionInfos.x[parentId];

  const { uiTypeId: parentUITypeId } =
    helpers.getStoreState().sectionConfigs.x[configId];

  const parentUIType = helpers.getStoreState().uiTypes.x[parentUITypeId];
  const { setUIType, setOneConfig } = helpers.getStoreActions().uiTypes;

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

  helpers
    .getStoreActions()
    .sectionInfos.setSectionInfo((x) => ({ ...x, ...newInfos }));

  helpers
    .getStoreActions()
    .sectionConfigs.setSectionConfig((x) => ({ ...x, ...newConfigs }));

  return _.keys(newInfos);
});
