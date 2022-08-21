import { act } from "react-dom/test-utils";
import { LIST_ROOT, SECTION } from "utils/constants";
import {
  createStoreWrapperWithData,
  getAvailableUITypeIds,
  getParameterToTestOnAndInitialUIType,
  getSectionByName,
  getUITypeByName,
  setParamToObjectTypeAndAddChildSection,
} from "__tests__utils/createStoreWrapperWithData";
import {
  renderUseGetParamUIType,
  renderUseGetSectionType,
  renderUseSetUIType,
} from "__tests__utils/renderHooks";

test.each([
  ["", SECTION, true],
  ["torchvision transforms", LIST_ROOT, false],
])(
  "Available uiTypes for nested parameters should be the same when viewed from the section's perspective.",
  (uiTypeName, uiTypeType, isBasePreset) => {
    testAvailableUITypes(uiTypeName, uiTypeType, isBasePreset);
  }
);

function testAvailableUITypes(uiTypeName, uiTypeType, isBasePreset) {
  const { store, wrapper } = createStoreWrapperWithData();

  let result = null;

  // get section, param, and ui type to test on
  const {
    sectionInfo: { id: sectionId },
    paramInfo: { id: paramInfoId, name: paramName },
    initialUIType,
  } = getParameterToTestOnAndInitialUIType(store, wrapper, "dataset_root");

  ({ result } = renderUseGetSectionType(sectionId, wrapper));
  const sectionType = result.current;

  // Get a base preset to fork off of
  const typeToForkOff = getUITypeByName(
    store,
    uiTypeName,
    uiTypeType,
    isBasePreset
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
  const paramChildId = setParamToObjectTypeAndAddChildSection(
    wrapper,
    propsForSetUIType,
    typeToForkOff
  );

  // The param's uitype should now be typeToForkOff
  ({ result } = renderUseGetParamUIType(sectionId, paramInfoId, wrapper));
  expect(result.current).toEqual(typeToForkOff);

  // The child section's type should also now be typeToForkOff
  ({ result } = renderUseGetSectionType(paramChildId, wrapper));
  expect(result.current).toEqual(typeToForkOff);

  // get the child section's info object
  const childSectionInfo = getSectionByName(store, paramName);
  expect(childSectionInfo.name).toEqual(paramName);
  expect(childSectionInfo.paramInfoId).toEqual(paramInfoId);

  // change the section's config
  ({ result } = renderUseSetUIType(
    {
      ...propsForSetUIType,
      childId: paramChildId,
      settingSectionConfig: true,
      currUIType: typeToForkOff,
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
  expect(forkedUIType.type).toEqual(uiTypeType);
  expect(forkedUIType).not.toEqual(typeToForkOff);
  expect(forkedUIType.isPreset).toEqual(false);
  expect(forkedUIType.config["ATestConfig"]).toEqual(["fruit"]);

  // The originInfoId should be the parent's uiTypeCollectionId + the paramInfoId
  expect(forkedUIType.originInfoId).toEqual({
    uiTypeCollectionId: sectionType.config.uiTypeCollectionId,
    paramInfoId,
  });

  let availableUITypeIds = getAvailableUITypeIds(
    { sectionId: paramChildId, settingSectionConfig: true },
    store,
    wrapper
  );

  // available ui types should contain the currently used type
  expect(availableUITypeIds).toContain(forkedUIType.id);

  availableUITypeIds = getAvailableUITypeIds(
    { sectionId, paramInfoId },
    store,
    wrapper
  );

  // available ui types should contain the currently used type
  expect(availableUITypeIds).toContain(forkedUIType.id);

  // Get a different parameter
  const { sectionInfo: aDifferentSectionInfo, paramInfo: aDifferentParamInfo } =
    getParameterToTestOnAndInitialUIType(store, wrapper, "batch_size");

  availableUITypeIds = getAvailableUITypeIds(
    {
      sectionId: aDifferentSectionInfo.id,
      paramInfoId: aDifferentParamInfo.id,
    },
    store,
    wrapper
  );

  // The different parameter shouldn't contain the forked ui type
  expect(availableUITypeIds).not.toContain(forkedUIType.id);
}
