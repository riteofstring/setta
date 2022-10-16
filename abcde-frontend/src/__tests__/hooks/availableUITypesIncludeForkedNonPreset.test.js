import { waitFor } from "@testing-library/react";
import { isBasePreset } from "utils/uiTypeConstants";
import {
  createStoreWrapperWithData,
  getAvailableUITypeIds,
  getParameterToTestOnAndInitialUIType,
  testSectionNamesParamNames,
} from "__tests__utils/createStoreWrapperWithData";
import {
  changeUITypeConfig,
  renderUseGetParamUIType,
  renderUseSetUIType,
} from "__tests__utils/renderHooks";

test.each(testSectionNamesParamNames({}))(
  "Forked non-presets should always appear, sectionName=$sectionName, paramName=$paramName",
  async ({ sectionName, paramName }) =>
    await testAvailableForkedNonPreset(sectionName, paramName)
);

async function testAvailableForkedNonPreset(inputSectionName, inputParamName) {
  const { store, wrapper } = await createStoreWrapperWithData();

  let result = null;

  // get OtherParameters section, and dataset_root parameter
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

  const hookProps = {
    sectionId,
    paramInfoId,
    defaultName: paramName,
    settingSectionConfig: false,
    settingPreset: false,
    currUIType: initialUIType,
  };

  // Modify the uitype to create a forked non-preset type
  changeUITypeConfig(hookProps, "maxValue", () => "910", wrapper);

  ({ result } = renderUseGetParamUIType(sectionId, paramInfoId, wrapper));
  const newUIType = result.current;

  // get the available uitypes
  let availableUITypeIds = getAvailableUITypeIds(
    { sectionId, paramInfoId },
    store,
    wrapper
  );

  // should contain the preset type (unless it's a base preset)
  if (!isBasePreset(initialUIType)) {
    expect(availableUITypeIds).toContain(initialUIType.id);
  }
  // should contain the forked type
  expect(availableUITypeIds).toContain(newUIType.id);

  // set back to original type
  ({ result } = renderUseSetUIType(hookProps, wrapper));
  waitFor(() => result.current[0](initialUIType.id));

  availableUITypeIds = getAvailableUITypeIds(
    { sectionId, paramInfoId },
    store,
    wrapper
  );

  // should contain the preset type
  expect(availableUITypeIds).toContain(initialUIType.id);
  // should contain the forked type
  expect(availableUITypeIds).toContain(newUIType.id);
}
