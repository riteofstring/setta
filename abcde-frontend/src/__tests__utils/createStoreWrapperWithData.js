import _ from "lodash";
import { act } from "react-dom/test-utils";
import { requiresNestedSection } from "utils/constants";
import { loadTestData } from "./loadTestData";
import {
  renderUseAddChild,
  renderUseAvailablePresetUITypes,
  renderUseGetParamUIType,
  renderUseGetSectionType,
  renderUseInitializeUIType,
  renderUseParamChildId,
  renderUseSetUIType,
} from "./renderHooks";
import { createStore, getStoreProviderWrapper } from "./utils";

export function createStoreWrapperWithData() {
  const store = createStore();
  store.getActions().master.loadSections(loadTestData());
  return { store, wrapper: getStoreProviderWrapper(store) };
}

export function getSectionByName(store, name) {
  return _.filter(store.getState().sectionInfos.x, (v) => v.name === name)[0];
}

export function getParamInfoByName(paramCollection, name) {
  return _.filter(paramCollection.children, (v) => v.name === name)[0];
}

export function getUITypeByName(store, name, type, isBasePreset) {
  return _.filter(
    store.getState().uiTypes.x,
    (v) => v.name === name && v.type === type && v.isBasePreset === isBasePreset
  )[0];
}

// returns dataset_root parameter of the OtherParameters section
export function getParameterToTestOn(store, wrapper, paramName) {
  let result = null;

  // get OtherParameters section
  const sectionInfo = getSectionByName(store, "OtherParameters");

  const { id: sectionId, uiTypeId: sectionTypeId } = sectionInfo;
  // get OtherParameters sectionType
  ({ result } = renderUseGetSectionType(sectionId, wrapper));
  expect(result.current.id).toEqual(sectionTypeId);
  const paramCollectionId = result.current.config.parameters[0];

  // get the param collection that OtherParameters contains
  const variousParams =
    store.getState().master.allParamCollections.children[paramCollectionId];

  // get the parameter we are going to test on
  const paramInfo = getParamInfoByName(variousParams, paramName);
  return { sectionInfo, paramInfo };
}

export function initializeAndReturnUIType(sectionId, paramInfo, wrapper) {
  let result = null;
  // initialize paramInfo's uiType
  // This is usually done in ParamContainer when the parameter loads
  ({ result } = renderUseInitializeUIType(sectionId, paramInfo, wrapper));
  act(() => result.current());

  // get the param's initial uiType
  ({ result } = renderUseGetParamUIType(sectionId, paramInfo.id, wrapper));
  return result.current;
}

export function getParameterToTestOnAndInitialUIType(
  store,
  wrapper,
  paramName
) {
  // get section and parameter to test on
  const { sectionInfo, paramInfo } = getParameterToTestOn(
    store,
    wrapper,
    paramName
  );

  // get the param's initial ui type
  const initialUIType = initializeAndReturnUIType(
    sectionInfo.id,
    paramInfo,
    wrapper
  );
  return { sectionInfo, paramInfo, initialUIType };
}

export function setParamToObjectTypeAndAddChildSection(
  wrapper,
  setUITypeProps,
  objectUIType
) {
  let result = null;

  // set param to use this new uiType
  ({ result } = renderUseSetUIType(setUITypeProps, wrapper));

  act(() => result.current[0](objectUIType.id));

  const { sectionId, paramInfoId, defaultName } = setUITypeProps;
  // uiType should be listRootUIType
  ({ result } = renderUseGetParamUIType(sectionId, paramInfoId, wrapper));
  expect(result.current).toEqual(objectUIType);

  // And it should require a nested section
  expect(requiresNestedSection(result.current.type)).toBeTruthy();

  // Add child. Normally this happens automatically in the conditionally rendered NestedObjectInput component.
  ({ result } = renderUseAddChild(sectionId, wrapper));
  act(() =>
    result.current({
      name: defaultName,
      uiTypeId: objectUIType.id,
      parentParamInfoId: paramInfoId,
    })
  );

  // Get the section id of the new nested section
  ({ result } = renderUseParamChildId(sectionId, paramInfoId, wrapper));

  // return paramChildId
  return result.current[0];
}

export function getAvailableUITypeIds(hookProps, wrapper) {
  let result = null;
  // get available ui types for the section
  ({ result } = renderUseAvailablePresetUITypes(hookProps, wrapper));
  const ids = result.current.map((x) => x.id);
  expect(_.uniq(ids).length).toEqual(ids.length);
  return ids;
}
