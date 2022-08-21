import { act } from "react-dom/test-utils";
import {
  createStoreWrapperWithData,
  getAvailableUITypeIds,
  getParameterToTestOnAndInitialUIType,
  getSectionByName,
} from "__tests__utils/createStoreWrapperWithData";
import {
  renderUseGetParamUIType,
  renderUseGetSectionType,
  renderUseSetUIType,
} from "__tests__utils/renderHooks";

test("Sections that use the same parameters, but with different uiTypeCollectionIds, should not see each other's forked non-presets", () => {
  testUnlinkedSections();
});

function testUnlinkedSections() {
  const { store, wrapper } = createStoreWrapperWithData();

  let result = null;

  // get OtherParameters section, and dataset_root parameter
  // get section, param, and ui type to test on
  const {
    sectionInfo: { id: sectionId },
    paramInfo: { id: paramInfoId, name: paramName },
    initialUIType,
  } = getParameterToTestOnAndInitialUIType(store, wrapper, "dataset_root");

  // Modify the uitype to create a forked non-preset type
  ({ result } = renderUseSetUIType(
    {
      sectionId,
      paramInfoId,
      defaultName: paramName,
      settingSectionConfig: false,
      settingPreset: false,
      currUIType: initialUIType,
    },
    wrapper
  ));
  act(() =>
    result.current[1]({
      configName: "maxValue",
      newValueFn: () => "910",
    })
  );

  // The param's uitype should now be typeToForkOff
  ({ result } = renderUseGetParamUIType(sectionId, paramInfoId, wrapper));
  const newUIType = result.current;

  // get the X section and its initial ui type
  const xSection = getSectionByName(store, "X");
  ({ result } = renderUseGetSectionType(xSection.id, wrapper));
  const xSectionInitialUIType = result.current;

  // Add the "various params" collection to the X section
  ({ result } = renderUseSetUIType(
    {
      defaultName: xSection.name,
      childId: xSection.id,
      settingSectionConfig: true,
      settingPreset: false,
      currUIType: xSectionInitialUIType,
    },
    wrapper
  ));
  act(() =>
    result.current[1]({
      configName: "parameters",
      newValueFn: (x) => [...x, "253cd8a8-a95a-4d15-b98b-73318b3632a1"],
    })
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
