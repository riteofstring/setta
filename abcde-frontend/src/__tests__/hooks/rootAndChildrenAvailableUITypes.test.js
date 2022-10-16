import { PANEID } from "utils/constants";
import { isPreset } from "utils/uiTypeConstants";
import { createListRootAndChild } from "__tests__utils/createListRootAndChild";
import {
  callMoveChildThunk,
  createStoreWrapperWithData,
  getAvailableUITypeIds,
  getParameterToTestOnAndInitialUIType,
  testSectionNamesParamNames,
} from "__tests__utils/createStoreWrapperWithData";
import {
  changeUITypeConfig,
  renderUseGetSectionType,
} from "__tests__utils/renderHooks";

test.each(testSectionNamesParamNames({}))(
  "A list/dict root shouldn't see the non-preset uitype of its children, and vice versa",
  async ({ sectionName, paramName }) => {
    await testRootAndChild(sectionName, paramName);
  }
);

async function testRootAndChild(inputSectionName, inputParamName) {
  const { store, wrapper } = await createStoreWrapperWithData();

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

  const propsForSetUIType = {
    sectionId,
    paramInfoId,
    defaultName: paramName,
    childId: null,
    settingSectionConfig: false,
    settingPreset: false,
    currUIType: initialUIType,
  };

  const { listRootSectionId, listRootType, rootChildId, rootChildUIType } =
    createListRootAndChild(
      store,
      wrapper,
      sectionId,
      paramInfoId,
      paramName,
      initialUIType,
      propsForSetUIType
    );

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
  expect(isPreset(listRootNewUIType)).toEqual(false);

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
  callMoveChildThunk(store, wrapper, {
    oldParentId: listRootSectionId,
    newParentId: PANEID,
    childId: rootChildId,
  });

  // a forked ui type is created because the subtype changes
  ({ result } = renderUseGetSectionType(rootChildId, wrapper));
  let rootChildNewUIType = result.current;
  expect(rootChildNewUIType.config.subType).toEqual(null);

  // rootChild should see its own uitype
  availableUITypeIds = getAvailableUITypeIds(
    { sectionId: rootChildId, settingSectionConfig: true },
    store,
    wrapper
  );
  expect(availableUITypeIds).toContain(rootChildNewUIType.id);

  // move rootChild back into its original place
  callMoveChildThunk(store, wrapper, {
    newParentId: listRootSectionId,
    childId: rootChildId,
  });

  // change the root child's config
  changeUITypeConfig(
    {
      ...propsForSetUIType,
      childId: rootChildId,
      settingSectionConfig: true,
      currUIType: rootChildNewUIType,
    },
    "parameters",
    () => ["253cd8a8-a95a-4d15-b98b-73318b3632a1"],
    wrapper
  );

  // get list root child's new type which is a non-preset
  ({ result } = renderUseGetSectionType(rootChildId, wrapper));
  rootChildNewUIType = result.current;
  expect(isPreset(rootChildNewUIType)).toEqual(false);

  // rootChild should see its new uitype + the uitype that originated from the root
  availableUITypeIds = getAvailableUITypeIds(
    { sectionId: rootChildId, settingSectionConfig: true },
    store,
    wrapper
  );

  expect(availableUITypeIds).toContain(rootChildUIType.id);
  expect(availableUITypeIds).toContain(rootChildNewUIType.id);
}
