import _ from "lodash";
import { act } from "react-dom/test-utils";
import {
  createStoreWrapperWithData,
  getParameterToTestOnAndInitialUIType,
} from "__tests__utils/createStoreWrapperWithData";
import { renderUseSetUIType } from "__tests__utils/renderHooks";

test.each(testCases())(
  "Setting a non-preset config multiple times should result in only 1 new ui type",
  (usesBasePresetUIType) => {
    testSetUIConfigMultipleTimes(usesBasePresetUIType);
  }
);

function testCases() {
  return [false, true];
}

function testSetUIConfigMultipleTimes(usesBasePresetUIType) {
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
    usesBasePresetUIType
  );

  expect(initialUIType.isPreset).toEqual(true);
  expect(initialUIType.isBasePreset).toEqual(usesBasePresetUIType);

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

  // set param to use this new uiType
  ({ result } = renderUseSetUIType(propsForSetUIType, wrapper));

  const initialNumberOfUITypes = _.size(store.getState().uiTypes.x);
  console.log("initialNumberOfUITypes", initialNumberOfUITypes);

  // set the config multiple times
  for (let val of [3, 23, 45, "dog"]) {
    act(() =>
      result.current[1]({
        configName: "someArbitraryConfig",
        newValueFn: () => val,
      })
    );
  }

  // number of uiTypes should have only increased by 1
  expect(_.size(store.getState().uiTypes.x)).toEqual(
    initialNumberOfUITypes + 1
  );
}
