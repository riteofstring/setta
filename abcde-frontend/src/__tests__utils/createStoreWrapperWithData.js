import _ from "lodash";
import { loadOneProject } from "./loadTestData";
import { renderUseGetSectionType } from "./renderHooks";
import { createStore, getStoreProviderWrapper } from "./utils";

export async function createStoreWrapperWithData() {
  const store = createStore();
  const testData = await loadOneProject({});
  store.getActions().master.loadSections(testData);
  return { store, wrapper: getStoreProviderWrapper(store) };
}

export function getSectionByName(store, name) {
  return _.filter(store.getState().sectionInfos.x, (v) => v.name === name)[0];
}

function getParamCollectionParamInfoByName(allObjInfo, paramCollection, name) {
  const childrenInfo = paramCollection.children.map((x) => allObjInfo[x]);
  return _.filter(childrenInfo, (v) => v.name === name)[0];
}

export function getParameterToTestOn(store, wrapper, sectionName, paramName) {
  let result = null;

  // get section
  const sectionInfo = getSectionByName(store, sectionName);

  const { id: sectionId, configId } = sectionInfo;
  const { uiTypeId: sectionTypeId } =
    store.getState().sectionConfigs.x[configId];
  // get sectionType
  ({ result } = renderUseGetSectionType(sectionId, wrapper));
  expect(result.current.id).toEqual(sectionTypeId);
  const evColId = result.current.config.collections[0];

  // get the param collection that the section contains
  const allObjInfo = store.getState().codeInfo.allObjInfo;
  const variousParams = allObjInfo[evColId];

  // get the parameter we are going to test on
  const paramInfo = getParamCollectionParamInfoByName(
    allObjInfo,
    variousParams,
    paramName
  );
  return { sectionInfo, paramInfo };
}
