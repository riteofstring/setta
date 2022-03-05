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
  const si = new SectionInfo({});
  const actions = store.getActions();
  actions.sectionInfos.setSectionInfo((x) => ({ ...x, [si.id]: si }));

  const uiType = addUIType(store);
  actions.uiTypes.setType({ uiTypeId: uiType.id, type: SECTION });

  actions.sectionInfos.setSectionInfoAttr({
    sectionId: si.id,
    attr: "uiTypeId",
    value: uiType.id,
  });
  return store.getState().sectionInfos.x[si.id];
}

export function addUIType(store) {
  const uiType = new UIType({});
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
