import {
  createStoreWrapperWithData,
  getAvailableUITypeIds,
  getParameterToTestOnAndInitialUIType,
  getSectionByName,
  testSectionNamesParamNames,
} from "__tests__utils/createStoreWrapperWithData";
import {
  changeUITypeConfig,
  renderUseGetParamUIType,
  renderUseGetSectionType,
} from "__tests__utils/renderHooks";

// exclude the X section since that's our "other" section to test on in this particular test
test.each(testSectionNamesParamNames({ excludeSections: ["X"] }))(
  "Sections that use the same parameters, but with different uiTypeCollectionIds, should not see each other's forked non-presets",
  ({ sectionName, paramName }) => {
    testUnlinkedSections(sectionName, paramName);
  }
);

function testUnlinkedSections(inputSectionName, inputParamName) {
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

  // Modify the uitype to create a forked non-preset type
  changeUITypeConfig(
    {
      sectionId,
      paramInfoId,
      defaultName: paramName,
      settingSectionConfig: false,
      settingPreset: false,
      currUIType: initialUIType,
    },
    "maxValue",
    () => "910",
    wrapper
  );

  // The param's uitype should now be typeToForkOff
  ({ result } = renderUseGetParamUIType(sectionId, paramInfoId, wrapper));
  const newUIType = result.current;

  // get the X section and its initial ui type
  const xSection = getSectionByName(store, "X");
  ({ result } = renderUseGetSectionType(xSection.id, wrapper));
  const xSectionInitialUIType = result.current;

  // Add the "various params" collection to the X section
  changeUITypeConfig(
    {
      defaultName: xSection.name,
      childId: xSection.id,
      settingSectionConfig: true,
      settingPreset: false,
      currUIType: xSectionInitialUIType,
    },
    "parameters",
    (x) => [...x, "253cd8a8-a95a-4d15-b98b-73318b3632a1"],
    wrapper
  );

  // get the available uitypes for dataset_root in the X section
  let availableUITypeIds = getAvailableUITypeIds(
    { sectionId: xSection.id, paramInfoId },
    store,
    wrapper
  );

  // should contain the preset type
  expect(availableUITypeIds).toContain(initialUIType.id);
  // should NOT contain the forked type created in the OtherParameters section
  expect(availableUITypeIds).not.toContain(newUIType.id);
}
