import _ from "lodash";
import { act } from "react-dom/test-utils";
import {
  createStoreWrapperWithData,
  getParameterToTestOnAndInitialUIType,
  testSectionNamesParamNames,
} from "__tests__utils/createStoreWrapperWithData";
import { renderUseSetUIType } from "__tests__utils/renderHooks";

test.each(testSectionNamesParamNames({}))(
  "Setting a non-preset config multiple times should result in only 1 new ui type",
  ({ sectionName, paramName }) => {
    testSetUIConfigMultipleTimes(sectionName, paramName);
  }
);

function testSetUIConfigMultipleTimes(inputSectionName, inputParamName) {
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

  expect(initialUIType.isPreset).toEqual(true);

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
