import { waitFor } from "@testing-library/react";
import _ from "lodash";
import {
  PANEID,
  requiresNestedSection,
  SECTION_TYPE_NAMES,
} from "utils/constants";
import { isBasePreset } from "utils/uiTypeConstants";
import { getRootSectionId } from "utils/utils";
import { loadTestData } from "./loadTestData";
import {
  renderUseAvailablePresetUITypes,
  renderUseGetParamChildId,
  renderUseGetParamUIType,
  renderUseGetSectionType,
  renderUseIdsOverview,
  renderUseSetUIType,
} from "./renderHooks";
import { createStore, getStoreProviderWrapper } from "./utils";

export function createStoreWrapperWithData() {
  const store = createStore();
  const testData = loadTestData();
  const rootSection = getRootSectionId(testData.sectionChildren);
  store.getActions().currProject.setSectionGroup(rootSection);
  store.getActions().master.loadSections(testData);
  return { store, wrapper: getStoreProviderWrapper(store) };
}

export function getSectionByName(store, name) {
  return _.filter(store.getState().sectionInfos.x, (v) => v.name === name)[0];
}

export function getParamInfoByFullPath(allObjInfo, ...pathAsName) {
  let curr = null;
  let currChildren = Object.values(allObjInfo);
  for (const name of pathAsName) {
    curr = currChildren.filter((x) => x.name === name)[0];
    currChildren = curr.children.map((x) => allObjInfo[x]);
  }
  return curr;
}

function getParamCollectionParamInfoByName(allObjInfo, paramCollection, name) {
  const childrenInfo = paramCollection.children.map((x) => allObjInfo[x]);
  return _.filter(childrenInfo, (v) => v.name === name)[0];
}

export function getUITypeByName(store, name, type, useBasePreset) {
  return _.filter(
    store.getState().uiTypes.x,
    (v) =>
      v.name === name && v.type === type && isBasePreset(v) === useBasePreset
  )[0];
}

function getParameterToTestOn(store, wrapper, sectionName, paramName) {
  let result = null;

  // get section
  const sectionInfo = getSectionByName(store, sectionName);

  const { id: sectionId, configId } = sectionInfo;
  const { uiTypeId: sectionTypeId } =
    store.getState().sectionConfigs.x[configId];
  // get sectionType
  ({ result } = renderUseGetSectionType(sectionId, wrapper));
  expect(result.current.id).toEqual(sectionTypeId);
  const paramCollectionId = result.current.config.collections[0];

  // get the param collection that the section contains
  const allObjInfo = store.getState().master.allObjInfo;
  const variousParams = allObjInfo[paramCollectionId];

  // get the parameter we are going to test on
  const paramInfo = getParamCollectionParamInfoByName(
    allObjInfo,
    variousParams,
    paramName
  );
  return { sectionInfo, paramInfo };
}

export function callInitializeParamThunk(store, sectionId, paramInfo, wrapper) {
  // initialize paramInfo's uitype, enteredvalue etc.
  // This is usually done in ParamContainer when the parameter loads
  store.getActions().thunks.initializeParam({ sectionId, paramInfo });

  // get the param's initial uiType
  const { result } = renderUseGetParamUIType(sectionId, paramInfo.id, wrapper);
  return result.current;
}

export function getParameterToTestOnAndInitialUIType(
  store,
  wrapper,
  sectionName,
  paramName
) {
  // get section and parameter to test on
  const { sectionInfo, paramInfo } = getParameterToTestOn(
    store,
    wrapper,
    sectionName,
    paramName
  );

  // get the param's initial ui type
  const initialUIType = callInitializeParamThunk(
    store,
    sectionInfo.id,
    paramInfo,
    wrapper
  );

  return { sectionInfo, paramInfo, initialUIType };
}

export function addChildSectionAndGetChildId(
  sectionId,
  paramInfoId,
  defaultName,
  uiTypeId,
  store,
  wrapper
) {
  let result = null;
  // Add child. Normally this happens automatically in the conditionally rendered NestedObjectInput component.
  store.getActions().thunks.addChild({
    parentId: sectionId,
    name: defaultName,
    uiTypeId,
    parentParamInfoId: paramInfoId,
  });

  // Get the section id of the new nested section
  ({ result } = renderUseGetParamChildId(sectionId, paramInfoId, wrapper));

  // return paramChildId
  return result.current;
}

export function setParamToObjectTypeAndAddChildSection(
  store,
  wrapper,
  setUITypeProps,
  objectUIType
) {
  let result = null;

  // set param to use this new uiType
  ({ result } = renderUseSetUIType(setUITypeProps, wrapper));

  waitFor(() => result.current[0](objectUIType.id));

  const { sectionId, paramInfoId, defaultName } = setUITypeProps;
  // uiType should be listRootUIType
  ({ result } = renderUseGetParamUIType(sectionId, paramInfoId, wrapper));
  expect(result.current).toEqual(objectUIType);

  // And it should require a nested section
  expect(requiresNestedSection(result.current.type)).toBeTruthy();

  return addChildSectionAndGetChildId(
    sectionId,
    paramInfoId,
    defaultName,
    objectUIType.id,
    store,
    wrapper
  );
}

export function getAvailableUITypeIds(hookProps, store, wrapper) {
  let result = null;
  // get available ui types for the section
  ({ result } = renderUseAvailablePresetUITypes(hookProps, wrapper));
  const ids = result.current.map((x) => x.id);
  expect(_.uniq(ids).length).toEqual(ids.length);
  // If configuring section, then only section types should be available.
  // Otherwise, both section types and parameter types should be available.
  expect(
    ids.every((id) =>
      SECTION_TYPE_NAMES.includes(store.getState().uiTypes.x[id].type)
    )
  ).toEqual(!!hookProps.settingSectionConfig);
  return ids;
}

export function testSectionNamesParamNames({ excludeSections = [] }) {
  const otherParameters = [
    "dataset_root",
    "batch_size",
    "test_batch_size",
    "epochs",
  ].map((x) => ({ sectionName: "OtherParameters", paramName: x }));
  const xParameters = ["birth_location"].map((x) => ({
    sectionName: "X",
    paramName: x,
  }));
  const output = [...otherParameters, ...xParameters];
  return output.filter((x) => !excludeSections.includes(x.sectionName));
}

export async function callMoveChildThunk(store, wrapper, props) {
  await waitFor(() => store.getActions().sectionInfos.moveChildThunk(props));
  if (props.newParentId && props.newParentId !== PANEID) {
    renderUseIdsOverview(props.newParentId, wrapper);
  }
}
