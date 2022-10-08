import { LIST, LIST_ROOT } from "utils/constants";
import {
  getUITypeByName,
  setParamToObjectTypeAndAddChildSection,
} from "./createStoreWrapperWithData";
import { renderUseGetSectionType, renderUseIdsOverview } from "./renderHooks";

export function createListRootAndChild(
  store,
  wrapper,
  sectionId,
  paramInfoId,
  paramName,
  initialUIType,
  propsForSetUIType
) {
  let result = null;
  // Get a base preset to fork off of
  const listRootType = getUITypeByName(
    store,
    "my preset for testing",
    LIST_ROOT,
    false
  );

  // Props that are constant in this test
  const _propsForSetUIType = propsForSetUIType
    ? propsForSetUIType
    : {
        sectionId,
        paramInfoId,
        defaultName: paramName,
        childId: null,
        settingSectionConfig: false,
        settingPreset: false,
        currUIType: initialUIType,
      };

  // set the param to the base preset type, and add a child section
  const listRootSectionId = setParamToObjectTypeAndAddChildSection(
    store,
    wrapper,
    _propsForSetUIType,
    listRootType
  );

  const listRootSectionInfo =
    store.getState().sectionInfos.x[listRootSectionId];

  // The param's uitype should now be listRootType
  ({ result } = renderUseGetSectionType(listRootSectionId, wrapper));
  expect(result.current).toEqual(listRootType);

  // Add child to the root (simulates clicking on incrementer)
  store
    .getActions()
    .thunks.addChild({ parentId: listRootSectionId, numChildren: 1 });

  // get list root's child
  ({ result } = renderUseIdsOverview(listRootSectionId, wrapper));
  const rootChildren = result.current;
  const rootChildInfo = store.getState().sectionInfos.x[rootChildren[0]];
  expect(rootChildren.length).toEqual(1);
  expect(rootChildInfo.parentId).toEqual(listRootSectionId);
  const { id: rootChildId } = rootChildInfo;

  ({ result } = renderUseGetSectionType(rootChildId, wrapper));
  const rootChildUIType = result.current;
  expect(rootChildUIType.config.subType).toEqual(LIST);

  return {
    listRootSectionInfo,
    listRootSectionId,
    listRootType,
    rootChildId,
    rootChildInfo,
    rootChildUIType,
  };
}
