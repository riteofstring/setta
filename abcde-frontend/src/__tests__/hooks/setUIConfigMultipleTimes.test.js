import { waitFor } from "@testing-library/react";
import _ from "lodash";
import { isPreset } from "utils/uiTypeConstants";
import {
  createStoreWrapperWithData,
  getParameterToTestOnAndInitialUIType,
  testSectionNamesParamNames,
} from "__tests__utils/createStoreWrapperWithData";
import { renderUseSetUIType } from "__tests__utils/renderHooks";

test.each(testSectionNamesParamNames({}))(
  "Setting a non-preset config multiple times should result in only 1 new ui type",
  async ({ sectionName, paramName }) => {
    await testSetUIConfigMultipleTimes(sectionName, paramName);
  }
);

async function testSetUIConfigMultipleTimes(inputSectionName, inputParamName) {
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

  expect(isPreset(initialUIType)).toEqual(true);

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
  const initialNumberOfUITypes = _.size(store.getState().uiTypes.x);

  // set the config multiple times
  for (let val of [3, 23, 45, "dog"]) {
    // set param to use this new uiType
    ({ result } = renderUseSetUIType(propsForSetUIType, wrapper));
    await waitFor(() =>
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
