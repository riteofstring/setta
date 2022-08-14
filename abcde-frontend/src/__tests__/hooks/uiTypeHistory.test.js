import { act } from "@testing-library/react-hooks";
import _ from "lodash";
import { LIST_ROOT, requiresNestedSection } from "utils/constants";
import { createStoreWrapperWithData } from "__tests__utils/createStoreWrapperWithData";
import {
  renderUseAddChild,
  renderUseGetParamUIType,
  renderUseGetSectionType,
  renderUseIdsOverview,
  renderUseInitializeUIType,
  renderUseParamChildId,
  renderUseParamEnteredValue,
  renderUseSetUIType,
} from "__tests__utils/renderHooks";
import { addUIType } from "__tests__utils/utils";

test("Settings for a param's uiType should persist when switching away from it and back to it again", () => {
  testUITypeHistory();
});

function testUITypeHistory() {
  const { store, wrapper } = createStoreWrapperWithData();

  let result = null;

  // get OtherParameters section from test data
  const { id: sectionId, uiTypeId: sectionTypeId } = _.filter(
    store.getState().sectionInfos.x,
    (v) => v.name === "OtherParameters"
  )[0];

  // get OtherParameters sectionType
  ({ result } = renderUseGetSectionType(sectionId, wrapper));
  expect(result.current.id).toEqual(sectionTypeId);
  const paramCollectionId = result.current.config.parameters[0];

  // get the param collection that OtherParameters contains
  const variousParams =
    store.getState().master.allParamCollections.children[paramCollectionId];

  // get the parameter we are going to test on
  const paramInfo = _.filter(
    variousParams.children,
    (v) => v.name === "dataset_root"
  )[0];
  const { id: paramInfoId, name: paramName } = paramInfo;

  // initialize paramInfo's uiType
  // This is usually done in ParamContainer when the parameter loads
  ({ result } = renderUseInitializeUIType(sectionId, paramInfo, wrapper));
  act(() => result.current());

  // get the param's initial uiType
  ({ result } = renderUseGetParamUIType(sectionId, paramInfoId, wrapper));
  const initialUIType = result.current;

  // Check that no value has been entered yet
  ({ result } = renderUseParamEnteredValue(sectionId, paramInfoId, wrapper));
  const [enteredValue, setEnteredValue] = result.current;
  expect(enteredValue).toEqual("");

  // Check that enteredValue gets updated correctly
  const testFolderName = "my/special/folder";
  act(() => setEnteredValue(testFolderName));
  ({ result } = renderUseParamEnteredValue(sectionId, paramInfoId, wrapper));
  expect(result.current[0]).toEqual(testFolderName);

  // Current num children should be 0
  ({ result } = renderUseIdsOverview(sectionId, wrapper));
  expect(result.current[0]).toEqual([]);

  // Add a list root ui type
  const listRootUIType = addUIType(store, { type: LIST_ROOT, isPreset: false });
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

  // set param to use this new uiType
  ({ result } = renderUseSetUIType(
    {
      ...propsForSetUIType,
      currUIType: initialUIType,
    },
    wrapper
  ));

  act(() => result.current[0](listRootUIType.id));

  // uiType should be listRootUIType
  ({ result } = renderUseGetParamUIType(sectionId, paramInfoId, wrapper));
  expect(result.current).toEqual(listRootUIType);

  // And it should require a nested section
  expect(requiresNestedSection(result.current.type)).toBeTruthy();

  // Add child. Normally this happens automatically in the conditionally rendered NestedObjectInput component.
  ({ result } = renderUseAddChild(sectionId, wrapper));
  act(() =>
    result.current({
      name: paramName,
      uiTypeId: listRootUIType.id,
      parentParamInfoId: paramInfoId,
    })
  );

  // Get the section id of the new nested section
  ({ result } = renderUseParamChildId(sectionId, paramInfoId, wrapper));
  const paramChildId = result.current[0];

  // The only child should be paramChildId
  ({ result } = renderUseIdsOverview(sectionId, wrapper));
  expect(result.current[0]).toEqual([paramChildId]);

  // set param to use the initial ui type
  ({ result } = renderUseSetUIType(
    {
      ...propsForSetUIType,
      childId: paramChildId,
      currUIType: listRootUIType,
    },
    wrapper
  ));
  act(() => result.current[0](initialUIType.id));

  // The listRootUIType should still exist
  expect(listRootUIType.id).toBeTruthy();
  expect(store.getState().uiTypes.x[listRootUIType.id]).toEqual(listRootUIType);

  // Current num children should be 0 again
  ({ result } = renderUseIdsOverview(sectionId, wrapper));
  expect(result.current[0]).toEqual([]);

  // set param back to be list root
  ({ result } = renderUseSetUIType(
    {
      ...propsForSetUIType,
      childId: paramChildId,
      currUIType: initialUIType,
    },
    wrapper
  ));
  act(() => result.current[0](listRootUIType.id));

  // The only child should be the ORIGINAL paramChildId
  ({ result } = renderUseIdsOverview(sectionId, wrapper));
  expect(result.current[0]).toEqual([paramChildId]);
}
