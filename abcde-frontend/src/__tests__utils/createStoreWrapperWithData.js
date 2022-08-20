import _ from "lodash";
import { act } from "react-dom/test-utils";
import { loadTestData } from "./loadTestData";
import {
  renderUseGetParamUIType,
  renderUseGetSectionType,
  renderUseInitializeUIType,
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

// returns dataset_root parameter of the OtherParameters section
export function getParameterToTestOn(store, wrapper, usesBasePresetUIType) {
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

  const paramName = usesBasePresetUIType ? "batch_size" : "dataset_root";

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
  usesBasePresetUIType = false
) {
  // get section and parameter to test on
  const { sectionInfo, paramInfo } = getParameterToTestOn(
    store,
    wrapper,
    usesBasePresetUIType
  );

  // get the param's initial ui type
  const initialUIType = initializeAndReturnUIType(
    sectionInfo.id,
    paramInfo,
    wrapper
  );
  return { sectionInfo, paramInfo, initialUIType };
}
