import { PANEID } from "utils/constants";
import { createListRootAndChild } from "__tests__utils/createListRootAndChild";
import {
  callMoveChildThunk,
  createStoreWrapperWithData,
  getParameterToTestOnAndInitialUIType,
} from "__tests__utils/createStoreWrapperWithData";
import { renderUseGetSectionType } from "__tests__utils/renderHooks";

test("Moving a list section outside of a list should change its subtype", () => {
  testMovingListSection();
});

function testMovingListSection() {
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
    "OtherParameters",
    "dataset_root"
  );

  // create list root and a child
  const { listRootSectionId, rootChildId } = createListRootAndChild(
    store,
    wrapper,
    sectionId,
    paramInfoId,
    paramName,
    initialUIType
  );

  // move child to the pane (top-level)
  callMoveChildThunk(store, wrapper, {
    oldParentId: listRootSectionId,
    newParentId: PANEID,
    childId: rootChildId,
  });

  // its subtype should no longer be LIST
  ({ result } = renderUseGetSectionType(rootChildId, wrapper));
  const rootChildUIType = result.current;
  expect(rootChildUIType.config.subType).toEqual(null);
}
