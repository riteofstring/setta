import { act } from "react-dom/test-utils";
import {
  createStoreWrapperWithData,
  getAvailableUITypeIds,
  getParameterToTestOnAndInitialUIType,
} from "__tests__utils/createStoreWrapperWithData";
import {
  renderUseGetParamUIType,
  renderUseSetUIType,
} from "__tests__utils/renderHooks";

test("Forked non-presets should always appear", () =>
  testAvailableForkedNonPreset());

function testAvailableForkedNonPreset() {
  const { store, wrapper } = createStoreWrapperWithData();

  let result = null;

  // get OtherParameters section, and dataset_root parameter
  // get section, param, and ui type to test on
  const {
    sectionInfo: { id: sectionId },
    paramInfo: { id: paramInfoId, name: paramName },
    initialUIType,
  } = getParameterToTestOnAndInitialUIType(store, wrapper, "dataset_root");

  const hookProps = {
    sectionId,
    paramInfoId,
    defaultName: paramName,
    settingSectionConfig: false,
    settingPreset: false,
    currUIType: initialUIType,
  };

  // Modify the uitype to create a forked non-preset type
  ({ result } = renderUseSetUIType(hookProps, wrapper));
  act(() =>
    result.current[1]({
      configName: "maxValue",
      newValueFn: () => "910",
    })
  );

  ({ result } = renderUseGetParamUIType(sectionId, paramInfoId, wrapper));
  const newUIType = result.current;

  // get the available uitypes for dataset_root in the X section
  let availableUITypeIds = getAvailableUITypeIds(
    { sectionId, paramInfoId },
    store,
    wrapper
  );

  // should contain the preset type
  expect(availableUITypeIds).toContain(initialUIType.id);
  // should contain the forked type created in the OtherParameters section
  expect(availableUITypeIds).toContain(newUIType.id);

  // set back to original type
  ({ result } = renderUseSetUIType(hookProps, wrapper));
  act(() => result.current[0](initialUIType.id));

  availableUITypeIds = getAvailableUITypeIds(
    { sectionId, paramInfoId },
    store,
    wrapper
  );

  // should contain the preset type
  expect(availableUITypeIds).toContain(initialUIType.id);
  // should contain the forked type created in the OtherParameters section
  expect(availableUITypeIds).toContain(newUIType.id);
}
