import { waitFor } from "@testing-library/react";
import { addParamInfo, addSectionInfo, addUIType } from "__tests__utils/utils";

// After calling this function, state.uiTypes.x will have 2 uiTypes
// One for the created uiType
// Another for the section (i.e. a sectionType)
export function createSectionInfoWithParam(store, paramIsNested = false) {
  const { section: si, sectionConfig: siConfig } = addSectionInfo(store);

  // create a UIType for a random parameter
  const uiType = addUIType(store);
  expect(uiType.id).toBeTruthy();
  const { uiTypeCollectionId, paramInfoId } = addParamInfo(
    store,
    si,
    uiType,
    paramIsNested
  );

  // set the section's UIType's config's uiTypeCollectionId
  waitFor(() => {
    store.getActions().uiTypes.setOneConfig({
      uiTypeId: siConfig.uiTypeId,
      configName: "uiTypeCollectionId",
      newValueFn: () => uiTypeCollectionId,
    });
  });

  return {
    si,
    uiType,
    uiTypeCollectionId,
    paramInfoId,
  };
}
