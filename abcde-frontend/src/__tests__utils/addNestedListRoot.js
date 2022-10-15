import { waitFor } from "@testing-library/react";
import {
  addChildSectionAndGetChildId,
  getParamInfoByFullPath,
  getSectionByName,
  initializeAndReturnUIType,
  initializeEnteredValueId,
} from "./createStoreWrapperWithData";
import {
  renderUseAddChild,
  renderUseIdsOverview,
  renderUseParamEnteredValue,
} from "./renderHooks";

// select the Compose object in the Transforms section
export function selectComposeTransform(store, wrapper, numTransforms) {
  expect(numTransforms).toBeLessThanOrEqual(3);

  let result = null;

  const paramInfo = getParamInfoByFullPath(
    store.getState().master.allPackageInfo,
    "torchvision",
    "transforms",
    "Compose",
    "transforms"
  );

  const objInfoId = paramInfo.parentId;

  const transformSection = getSectionByName(store, "Transform");

  // select the Compose object in the Transform section
  store.getActions().sectionInfos.setSectionInfoAttr({
    sectionId: transformSection.id,
    attr: "selectedItem",
    value: objInfoId,
  });

  // initialize its uitype to the project default, which is a LIST_ROOT
  const uiType = initializeAndReturnUIType(
    transformSection.id,
    paramInfo,
    wrapper
  );

  // add the list root section, and get its id
  const listRootId = addChildSectionAndGetChildId(
    transformSection.id,
    paramInfo.id,
    "transforms",
    uiType.id,
    wrapper
  );

  // transformSection should have a single child which is the list root
  ({ result } = renderUseIdsOverview(transformSection.id, wrapper));
  expect(result.current[0]).toEqual([listRootId]);

  // the list root shouldn't have any children yet
  ({ result } = renderUseIdsOverview(listRootId, wrapper));
  expect(result.current[0]).toEqual([]);

  // add numTransforms children to the list root
  ({ result } = renderUseAddChild(listRootId, wrapper));
  result.current({ numChildren: numTransforms });

  // list root should now have numTransforms children
  ({ result } = renderUseIdsOverview(listRootId, wrapper));
  const listElementIds = result.current[0];
  expect(listElementIds.length).toEqual(numTransforms);

  const transformSettings = listOfTransforms();

  // select object for each list element, and set some parameters
  for (let i = 0; i < listElementIds.length; i++) {
    const [objName, paramSettings] = transformSettings[i];
    for (let paramName of Object.keys(paramSettings)) {
      const paramInfo = getParamInfoByFullPath(
        store.getState().master.allPackageInfo,
        "torchvision",
        "transforms",
        objName,
        paramName
      );

      // select object
      store.getActions().sectionInfos.setSectionInfoAttr({
        sectionId: listElementIds[i],
        attr: "selectedItem",
        value: paramInfo.parentId,
      });

      // initialize enteredValueId
      initializeEnteredValueId(listElementIds[i], paramInfo.id, wrapper);

      ({ result } = renderUseParamEnteredValue(
        listElementIds[i],
        paramInfo.id,
        wrapper
      ));
      waitFor(() => result.current[1](paramSettings[paramName]));
    }
  }

  return { transformSectionId: transformSection.id, listRootId };
}

// a preset list of transforms for testing with
function listOfTransforms() {
  // objName, paramName:value
  return [
    ["CenterCrop", { size: 824 }],
    ["RandomCrop", { padding: 2, pad_if_needed: true }],
    ["Normalize", { mean: "75" }],
  ];
}

export function listOfTransformsAsJson() {
  return [
    { "O~torchvision.transforms.CenterCrop": { "P~size": 824 } },
    {
      "O~torchvision.transforms.RandomCrop": {
        "P~padding": 2,
        "P~pad_if_needed": true,
      },
    },
    { "O~torchvision.transforms.Normalize": { "P~mean": "S~75" } },
  ];
}
