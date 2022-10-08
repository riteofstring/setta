import { waitFor } from "@testing-library/react";
import { LIST_ROOT } from "utils/constants";
import { USER } from "utils/uiTypeConstants";
import {
  createStoreWrapperWithData,
  getParameterToTestOnAndInitialUIType,
  setParamToObjectTypeAndAddChildSection,
  testSectionNamesParamNames,
} from "__tests__utils/createStoreWrapperWithData";
import {
  renderUseIdsOverview,
  renderUseParamEnteredValue,
  renderUseSetUIType,
} from "__tests__utils/renderHooks";
import { addUIType } from "__tests__utils/utils";

test.each(testCases())(
  `Settings for a param's uiType should persist when switching away from it and back to it again.
This test goes through these steps:
1. Initialize a param's uiType (simulating a param rendering for the first time)
2. Checking that it has no entered value
3. Entering a value and checking that it updates correctly
4. Creating a new list-root ui type, and setting the param to use it
5. Adding a child (simulating the rendering of the NestedObjectInput component)
6. Changing the param ui type back to the initial type, and then back to the list-root.
7. Checking that the current child is the same as the child that was created in step 5.
Trying setting: presetType=$presetType, sectionName=$sectionName, paramName=$paramName

`,
  ({ presetType, sectionName, paramName }) => {
    testUITypeHistory(presetType, sectionName, paramName);
  }
);

function testCases() {
  const output = [];
  for (let presetType of [USER, null]) {
    for (let sectionNameParamName of testSectionNamesParamNames({})) {
      output.push({ presetType, ...sectionNameParamName });
    }
  }
  return output;
}

function testUITypeHistory(presetType, inputSectionName, inputParamName) {
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

  // Check that no value has been entered yet
  ({ result } = renderUseParamEnteredValue(sectionId, paramInfoId, wrapper));
  const [enteredValue, setEnteredValue] = result.current;
  expect(enteredValue).toEqual(null);

  // Check that enteredValue gets updated correctly
  const testFolderName = "my/special/folder";
  waitFor(() => setEnteredValue(testFolderName));
  ({ result } = renderUseParamEnteredValue(sectionId, paramInfoId, wrapper));
  expect(result.current[0]).toEqual(testFolderName);

  // Current num children should be 0
  ({ result } = renderUseIdsOverview(sectionId, wrapper));
  expect(result.current).toEqual([]);

  // Add a list root ui type
  const listRootUIType = addUIType(store, { type: LIST_ROOT, presetType });
  // Sanity check: the uiType should be in the state
  expect(store.getState().uiTypes.x[listRootUIType.id]).toEqual(listRootUIType);

  // Props that are constant in this test
  const propsForSetUIType = {
    sectionId,
    paramInfoId,
    defaultName: paramName,
    childId: null,
    settingSectionConfig: false,
  };

  const paramChildId = setParamToObjectTypeAndAddChildSection(
    store,
    wrapper,
    { ...propsForSetUIType, currUIType: initialUIType },
    listRootUIType
  );

  // The only child should be paramChildId
  ({ result } = renderUseIdsOverview(sectionId, wrapper));
  expect(result.current).toEqual([paramChildId]);

  // set param to use the initial ui type
  ({ result } = renderUseSetUIType(
    {
      ...propsForSetUIType,
      childId: paramChildId,
      currUIType: listRootUIType,
    },
    wrapper
  ));
  waitFor(() => result.current[0](initialUIType.id));

  // The listRootUIType should still exist
  expect(listRootUIType.id).toBeTruthy();
  expect(store.getState().uiTypes.x[listRootUIType.id]).toEqual(listRootUIType);

  // Current num children should be 0 again
  ({ result } = renderUseIdsOverview(sectionId, wrapper));
  expect(result.current).toEqual([]);

  // set param back to be list root
  ({ result } = renderUseSetUIType(
    {
      ...propsForSetUIType,
      childId: paramChildId,
      currUIType: initialUIType,
    },
    wrapper
  ));
  waitFor(() => result.current[0](listRootUIType.id));

  // The only child should be the ORIGINAL paramChildId
  ({ result } = renderUseIdsOverview(sectionId, wrapper));
  expect(result.current).toEqual([paramChildId]);
}
