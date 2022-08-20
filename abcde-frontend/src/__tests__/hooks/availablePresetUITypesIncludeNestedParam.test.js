import { isPreset, onlySectionTypes } from "hooks/usePresetUIType";
import { act } from "react-dom/test-utils";
import { SECTION } from "utils/constants";
import {
  createStoreWrapperWithData,
  getBasePresetByName,
  getParameterToTestOnAndInitialUIType,
  getSectionByName,
  setParamToObjectTypeAndAddChildSection,
} from "__tests__utils/createStoreWrapperWithData";
import {
  renderUseAvailablePresetUITypes,
  renderUseGetParamUIType,
  renderUseGetSectionType,
  renderUseSetUIType,
} from "__tests__utils/renderHooks";

test("Available uiTypes for nested parameters should be the same when viewed from the section's persepctive.", () => {
  const { store, wrapper } = createStoreWrapperWithData();

  let result = null;

  // get section, param, and ui type to test on
  const {
    sectionInfo: { id: sectionId },
    paramInfo: { id: paramInfoId, name: paramName },
    initialUIType,
  } = getParameterToTestOnAndInitialUIType(store, wrapper);

  // Get a base preset to fork off of
  const baseSectionType = getBasePresetByName(store, SECTION);

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
  const paramChildId = setParamToObjectTypeAndAddChildSection(
    wrapper,
    propsForSetUIType,
    baseSectionType
  );

  // The param's uitype should now be baseSectionType
  ({ result } = renderUseGetParamUIType(sectionId, paramInfoId, wrapper));
  expect(result.current).toEqual(baseSectionType);

  // The child section's type should also now be baseSectionType
  ({ result } = renderUseGetSectionType(paramChildId, wrapper));
  expect(result.current).toEqual(baseSectionType);

  // get the child section's info object
  const sectionInfo = getSectionByName(store, paramName);
  expect(sectionInfo.name).toEqual(paramName);
  expect(sectionInfo.paramInfoId).toEqual(paramInfoId);

  // change the section's config
  ({ result } = renderUseSetUIType(
    {
      ...propsForSetUIType,
      childId: paramChildId,
      settingSectionConfig: true,
      currUIType: baseSectionType,
    },
    wrapper
  ));

  act(() =>
    result.current[1]({
      configName: "ATestConfig",
      newValueFn: () => ["fruit"],
    })
  );

  // The section type should be a non-preset fork
  ({ result } = renderUseGetSectionType(paramChildId, wrapper));
  const forkedUIType = result.current;
  expect(forkedUIType.type).toEqual(SECTION);
  expect(forkedUIType).not.toEqual(baseSectionType);
  expect(forkedUIType.isPreset).toEqual(false);
  expect(forkedUIType.config["ATestConfig"]).toEqual(["fruit"]);

  // The originInfoId should be the section id, because this is where the config was changed
  expect(forkedUIType.originInfoId).toEqual(paramChildId);

  // get available ui types for the section
  ({ result } = renderUseAvailablePresetUITypes(
    [paramChildId],
    onlySectionTypes,
    wrapper
  ));
  let availableUITypeIds = result.current.map((x) => x.id);

  // available ui types should contain the currently used type
  expect(availableUITypeIds).toContain(forkedUIType.id);

  // get available ui types for the parameter
  ({ result } = renderUseAvailablePresetUITypes(
    [paramInfoId, paramChildId],
    isPreset,
    wrapper
  ));
  availableUITypeIds = result.current.map((x) => x.id);

  // available ui types should contain the currently used type
  expect(availableUITypeIds).toContain(forkedUIType.id);

  // Get a different parameter
  const { paramInfo: aDifferentParamInfo } =
    getParameterToTestOnAndInitialUIType(store, wrapper, true);

  // get available ui types for this parameter
  ({ result } = renderUseAvailablePresetUITypes(
    [aDifferentParamInfo.id, aDifferentParamInfo.childId],
    isPreset,
    wrapper
  ));

  // The different parameter shouldn't contain the forked ui type
  availableUITypeIds = result.current.map((x) => x.id);
  expect(availableUITypeIds).not.toContain(forkedUIType.id);
});
