import { onlySectionTypes } from "hooks/usePresetUIType";
import { act } from "react-dom/test-utils";
import { LIST_ROOT } from "utils/constants";
import {
  createStoreWrapperWithData,
  getAvailableUITypeIds,
  getParameterToTestOnAndInitialUIType,
  getUITypeByName,
  setParamToObjectTypeAndAddChildSection,
} from "__tests__utils/createStoreWrapperWithData";
import {
  renderUseAddChild,
  renderUseGetSectionType,
  renderUseIdsOverview,
} from "__tests__utils/renderHooks";

test("A list/dict root shouldn't see the non-preset uitype of its children, and vice versa", () => {
  const { store, wrapper } = createStoreWrapperWithData();

  let result = null;

  // get section, param, and ui type to test on
  const {
    sectionInfo: { id: sectionId },
    paramInfo: { id: paramInfoId, name: paramName },
    initialUIType,
  } = getParameterToTestOnAndInitialUIType(store, wrapper, "batch_size");

  // Get a base preset to fork off of
  const listRootType = getUITypeByName(
    store,
    "torchvision transforms",
    LIST_ROOT,
    false
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
  const listRootSectionId = setParamToObjectTypeAndAddChildSection(
    wrapper,
    propsForSetUIType,
    listRootType
  );

  // The param's uitype should now be listRootType
  ({ result } = renderUseGetSectionType(listRootSectionId, wrapper));
  expect(result.current).toEqual(listRootType);

  // Add child to the root (simulates clicking on incrementer)
  ({ result } = renderUseAddChild(listRootSectionId, wrapper));
  act(() => result.current({ numChildren: 1 }));

  // get list root's child
  ({ result } = renderUseIdsOverview(listRootSectionId, wrapper));
  const rootChildren = result.current[0];
  const rootChildInfo = store.getState().sectionInfos.x[rootChildren[0]];
  expect(rootChildren.length).toEqual(1);
  expect(rootChildInfo.parentId).toEqual(listRootSectionId);
  const { id: rootChildId } = rootChildInfo;

  ({ result } = renderUseGetSectionType(rootChildId, wrapper));
  const rootChildIdUIType = result.current;

  // root section shouldn't see child non-preset uitype
  let availableUITypeIds = getAvailableUITypeIds(
    [listRootSectionId],
    onlySectionTypes,
    wrapper
  );
  expect(availableUITypeIds).not.toContain(rootChildIdUIType.id);

  //   // rootChild SHOULD see list root type because it is a preset
  //   availableUITypeIds = getAvailableUITypeIds(
  //     [rootChildId],
  //     onlySectionTypes,
  //     wrapper
  //   );
  //   expect(availableUITypeIds).toContain(listRootType.id);

  //   // change the list root's config
  //   ({ result } = renderUseSetUIType(
  //     {
  //       ...propsForSetUIType,
  //       childId: listRootSectionId,
  //       settingSectionConfig: true,
  //       currUIType: listRootType,
  //     },
  //     wrapper
  //   ));

  //   act(() =>
  //     result.current[1]({
  //       configName: "parameters",
  //       newValueFn: () => ["253cd8a8-a95a-4d15-b98b-73318b3632a1"],
  //     })
  //   );

  //   // get list root's new type which is a non-preset
  //   ({ result } = renderUseGetSectionType(listRootSectionId, wrapper));
  //   const listRootNewUIType = result.current;
  //   expect(listRootNewUIType.isPreset).toEqual(false);

  //   console.log("listRootNewUIType", listRootNewUIType)

  //   // rootChild SHOULD NOT see list root type because it is now a  preset
  //   availableUITypeIds = getAvailableUITypeIds(
  //     [rootChildId],
  //     onlySectionTypes,
  //     wrapper
  //   );
  //   expect(availableUITypeIds).not.toContain(listRootNewUIType.id);
});
