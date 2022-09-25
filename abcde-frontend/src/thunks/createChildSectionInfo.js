import { thunk } from "easy-peasy";
import { createManySectionInfo } from "hooks/useCreateInfo";
import { getChildUITypeId } from "hooks/useUIType";
import _ from "lodash";

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

  const { name: parentName, uiTypeId: parentUITypeId } =
    helpers.getStoreState().sectionInfos.x[parentId];

  const parentUIType = helpers.getStoreState().uiTypes.x[parentUITypeId];
  const { setUIType, setOneConfig } = helpers.getStoreActions().uiTypes;

  const uiTypeId = maybeGetChildUITypeId(
    sectionInfoProps.uiTypeId,
    parentUIType,
    parentId,
    setUIType,
    setOneConfig
  );

  const newInfos = createManySectionInfo({
    sectionInfoProps: { ...sectionInfoProps, parentId, parentName, uiTypeId },
    numChildren,
  });

  helpers
    .getStoreActions()
    .sectionInfos.setSectionInfo((x) => ({ ...x, ...newInfos }));

  return _.keys(newInfos);
});
