import {
  addChildSectionAndGetChildId,
  getParamInfoByFullPath,
  getSectionByName,
  initializeAndReturnUIType,
} from "./createStoreWrapperWithData";
import { renderUseAddChild, renderUseIdsOverview } from "./renderHooks";

// select the Compose object in the Transforms section
export function selectComposeTransform(store, wrapper, numTransforms) {
  let result = null;

  const paramInfo = getParamInfoByFullPath(
    store.getState().master.allPackageInfo,
    "torchvision",
    "transforms",
    "Compose",
    "transforms"
  );

  const objInfoId = paramInfo.parentId;

  const transformSection = getSectionByName(store, "Transform");

  // select the Compose object in the Transform section
  store.getActions().sectionInfos.setSectionInfoAttr({
    sectionId: transformSection.id,
    attr: "selectedItem",
    value: objInfoId,
  });

  // initialize its uitype to the project default, which is a LIST_ROOT
  const uiType = initializeAndReturnUIType(
    transformSection.id,
    paramInfo,
    wrapper
  );

  // add the list root section, and get its id
  const listRootId = addChildSectionAndGetChildId(
    transformSection.id,
    paramInfo.id,
    "transforms",
    uiType.id,
    wrapper
  );

  // transformSection should have a single child which is the list root
  ({ result } = renderUseIdsOverview(transformSection.id, wrapper));
  expect(result.current[0]).toEqual([listRootId]);

  // the list root shouldn't have any children yet
  ({ result } = renderUseIdsOverview(listRootId, wrapper));
  expect(result.current[0]).toEqual([]);

  // add numTransforms children to the list root
  ({ result } = renderUseAddChild(listRootId, wrapper));
  result.current({ numChildren: numTransforms });

  // list root should now have numTransforms children
  ({ result } = renderUseIdsOverview(listRootId, wrapper));
  const listElementIds = result.current[0];
  expect(listElementIds.length).toEqual(numTransforms);
}
