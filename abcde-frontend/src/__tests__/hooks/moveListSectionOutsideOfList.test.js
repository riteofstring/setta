import { PANEID } from "utils/constants";
import { createListRootAndChild } from "__tests__utils/createListRootAndChild";
import {
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

  const { listRootSectionId, rootChildId } = createListRootAndChild(
    store,
    wrapper,
    sectionId,
    paramInfoId,
    paramName,
    initialUIType
  );

  store.getActions().sectionInfos.moveChildThunk({
    oldParentId: listRootSectionId,
    newParentId: PANEID,
    childId: rootChildId,
  });

  ({ result } = renderUseGetSectionType(rootChildId, wrapper));
  const rootChildUIType = result.current;
  expect(rootChildUIType.config.subType).toEqual(null);
}
