import { SectionConfig, SectionInfo } from "classes/mutableInfo";
import { UIType } from "classes/uiType";
import { StoreProvider } from "easy-peasy";
import _ from "lodash";
import { ReactFlowProvider } from "react-flow-renderer";
import store, { resetEntireState } from "store/store";
import { SECTION } from "utils/constants";

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
