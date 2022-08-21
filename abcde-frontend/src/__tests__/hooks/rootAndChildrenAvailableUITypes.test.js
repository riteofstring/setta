import { act } from "react-dom/test-utils";
import { LIST_ROOT, PANEID } from "utils/constants";
import {
  createStoreWrapperWithData,
  getAvailableUITypeIds,
  getParameterToTestOnAndInitialUIType,
  getUITypeByName,
  setParamToObjectTypeAndAddChildSection,
  testSectionNamesParamNames,
} from "__tests__utils/createStoreWrapperWithData";
import {
  changeUITypeConfig,
  renderUseAddChild,
  renderUseGetSectionType,
  renderUseIdsOverview,
} from "__tests__utils/renderHooks";

test.each(testSectionNamesParamNames({}))(
  "A list/dict root shouldn't see the non-preset uitype of its children, and vice versa",
  ({ sectionName, paramName }) => {
    testRootAndChild(sectionName, paramName);
  }
);

function testRootAndChild(inputSectionName, inputParamName) {
  const { store, wrapper } = createStoreWrapperWithData();

  let result = null;

  // get section, param, and ui type to test on
  const {
    sectionInfo: { id: sectionId },
    paramInfo: { id: paramInfoId, name: paramName },
    initialUIType,
  } = getParameterToTestOnAndInitialUIType(
    store,
    wrapper,
    inputSectionName,
    inputParamName
  );

  // Get a base preset to fork off of
  const listRootType = getUITypeByName(
    store,
    "torchvision transforms",
    LIST_ROOT,
    false
  );

  // Props that are constant in this test
  const propsForSetUIType = {
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
    wrapper,
    propsForSetUIType,
    listRootType
  );

  // The param's uitype should now be listRootType
  ({ result } = renderUseGetSectionType(listRootSectionId, wrapper));
  expect(result.current).toEqual(listRootType);

  // Add child to the root (simulates clicking on incrementer)
  ({ result } = renderUseAddChild(listRootSectionId, wrapper));
  act(() => result.current({ numChildren: 1 }));

  // get list root's child
  ({ result } = renderUseIdsOverview(listRootSectionId, wrapper));
  const rootChildren = result.current[0];
  const rootChildInfo = store.getState().sectionInfos.x[rootChildren[0]];
  expect(rootChildren.length).toEqual(1);
  expect(rootChildInfo.parentId).toEqual(listRootSectionId);
  const { id: rootChildId } = rootChildInfo;

  ({ result } = renderUseGetSectionType(rootChildId, wrapper));
  const rootChildUIType = result.current;

  // root section shouldn't see child non-preset uitype
  let availableUITypeIds = getAvailableUITypeIds(
    { sectionId: listRootSectionId, settingSectionConfig: true },
    store,
    wrapper
  );
  expect(availableUITypeIds).not.toContain(rootChildUIType.id);

  // rootChild SHOULD see list root type because it is a preset
  availableUITypeIds = getAvailableUITypeIds(
    { sectionId: rootChildId, settingSectionConfig: true },
    store,
    wrapper
  );
  expect(availableUITypeIds).toContain(listRootType.id);
  // it should also see its own non-preset uitype
  expect(availableUITypeIds).toContain(rootChildUIType.id);

  // change the list root's config
  changeUITypeConfig(
    {
      ...propsForSetUIType,
      childId: listRootSectionId,
      settingSectionConfig: true,
      currUIType: listRootType,
    },
    "parameters",
    () => ["253cd8a8-a95a-4d15-b98b-73318b3632a1"],
    wrapper
  );

  // get list root's new type which is a non-preset
  ({ result } = renderUseGetSectionType(listRootSectionId, wrapper));
  const listRootNewUIType = result.current;
  expect(listRootNewUIType.isPreset).toEqual(false);

  // rootChild SHOULD NOT see list root type because it is now a non-preset
  availableUITypeIds = getAvailableUITypeIds(
    { sectionId: rootChildId, settingSectionConfig: true },
    store,
    wrapper
  );
  expect(availableUITypeIds).not.toContain(listRootNewUIType.id);
  // it should still see its own non-preset uitype
  expect(availableUITypeIds).toContain(rootChildUIType.id);

  // move rootChild to be a top level section (no parent)
  store.getActions().sectionInfos.moveChildThunk({
    oldParentId: listRootSectionId,
    newParentId: PANEID,
    childId: rootChildId,
  });

  // rootChild should see its own uitype
  availableUITypeIds = getAvailableUITypeIds(
    { sectionId: rootChildId, settingSectionConfig: true },
    store,
    wrapper
  );
  expect(availableUITypeIds).toContain(rootChildUIType.id);

  // move rootChild back into its original place
  store.getActions().sectionInfos.moveChildThunk({
    newParentId: listRootSectionId,
    childId: rootChildId,
  });

  // change the root child's config
  changeUITypeConfig(
    {
      ...propsForSetUIType,
      childId: rootChildId,
      settingSectionConfig: true,
      currUIType: rootChildUIType,
    },
    "parameters",
    () => ["253cd8a8-a95a-4d15-b98b-73318b3632a1"],
    wrapper
  );

  // get list root child's new type which is a non-preset
  ({ result } = renderUseGetSectionType(rootChildId, wrapper));
  const rootChildNewUIType = result.current;
  expect(rootChildNewUIType.isPreset).toEqual(false);

  // rootChild should see its new uitype + the uitype that originated from the root
  availableUITypeIds = getAvailableUITypeIds(
    { sectionId: rootChildId, settingSectionConfig: true },
    store,
    wrapper
  );

  expect(availableUITypeIds).toContain(rootChildUIType.id);
  expect(availableUITypeIds).toContain(rootChildNewUIType.id);
}
