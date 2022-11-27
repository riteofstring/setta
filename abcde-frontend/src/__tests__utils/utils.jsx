import { SectionConfig, SectionInfo } from "classes/mutableInfo";
import { UIType } from "classes/uiType";
import { StoreProvider } from "easy-peasy";
import _ from "lodash";
import { ReactFlowProvider } from "react-flow-renderer";
import store, { resetEntireState } from "store/store";
import { SECTION } from "utils/constants";
import { loadOneProject } from "./loadTestData";
import { renderUseGetSectionType } from "./renderHooks";

export async function createStoreWrapperWithData({ loadData = true }) {
  const store = createStore();
  if (loadData) {
    const testData = await loadOneProject({});
    store.getActions().master.loadSections(testData);
  }
  return { store, wrapper: getStoreProviderWrapper(store) };
}

export function getSectionByName(store, name) {
  return _.filter(store.getState().sectionInfos.x, (v) => v.name === name)[0];
}

function getParamCollectionParamInfoByName(allCodeInfo, paramCollection, name) {
  const childrenInfo = paramCollection.children.map((x) => allCodeInfo[x]);
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
  ({ result } = renderUseGetSectionType(sectionId, ["id", "config"], wrapper));
  expect(result.current[0]).toEqual(sectionTypeId);
  const evColId = result.current[1].collections[0];

  // get the param collection that the section contains
  const allCodeInfo = store.getState().codeInfo.allCodeInfo;
  const variousParams = allCodeInfo[evColId];

  // get the parameter we are going to test on
  const paramInfo = getParamCollectionParamInfoByName(
    allCodeInfo,
    variousParams,
    paramName
  );
  return { sectionInfo, paramInfo };
}

export function createStore() {
  resetEntireState();
  return store;
}

export function addSectionInfo(store, inputUIType = null) {
  let uiType = inputUIType;
  if (!uiType) {
    uiType = addUIType(store, { type: SECTION });
  }
  const si = new SectionInfo({});
  const siConfig = new SectionConfig({ id: si.configId, uiTypeId: uiType.id });
  store
    .getActions()
    .sectionInfos.setSectionInfo((x) => ({ ...x, [si.id]: si }));
  store.getActions().sectionConfigs.setSectionConfig((x) => ({
    ...x,
    [siConfig.id]: siConfig,
  }));
  return { section: si, sectionConfig: siConfig };
}

export function addUIType(store, props = {}) {
  const uiType = new UIType(props);
  store.getActions().uiTypes.setUIType({ uiType });
  return uiType;
}

export function getStoreProviderWrapper(store) {
  return ({ children }) => (
    <StoreProvider store={store}>
      <ReactFlowProvider>{children}</ReactFlowProvider>
    </StoreProvider>
  );
}

export function sectionIdFromName(store, name) {
  const sections = store.getState().sectionInfos.x;
  return _.filter(sections, (x) => x.name === name)[0].id;
}
