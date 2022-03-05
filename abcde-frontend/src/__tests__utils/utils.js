import { SectionInfo } from "classes/mutableInfo";
import { UIType } from "classes/uiType";
import { StoreProvider } from "easy-peasy";
import store, { resetEntireState } from "store/store";
import { SECTION } from "utils/constants";
import { createNewId } from "utils/utils";

export function createStore() {
  resetEntireState();
  return store;
}

export function addSectionInfo(store) {
  const uiType = addUIType(store, { type: SECTION });
  const si = new SectionInfo({ uiTypeId: uiType.id });
  store
    .getActions()
    .sectionInfos.setSectionInfo((x) => ({ ...x, [si.id]: si }));
  return si;
}

export function addUIType(store, props = {}) {
  const uiType = new UIType(props);
  store.getActions().uiTypes.setUIType({ uiType });
  return uiType;
}

export function addMutableParamUITypeInfo(store, uiTypeId) {
  const [collectionId, paramInfoId] = [createNewId(), createNewId()];
  store
    .getActions()
    .paramInfos.setUITypeId({ collectionId, paramInfoId, uiTypeId });
  return [collectionId, paramInfoId];
}

export function addChild(store, si, childId) {
  const newStateFn = (x) => [...x, childId];
  store
    .getActions()
    .sectionInfos.setIdsOverviewThunk({ sectionId: si.id, newStateFn });
}

export function getStoreProviderWrapper(store) {
  return ({ children }) => (
    <StoreProvider store={store}>{children}</StoreProvider>
  );
}
