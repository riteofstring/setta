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

export function addSectionInfo(store, inputUIType = null) {
  let uiType = inputUIType;
  if (!uiType) {
    uiType = addUIType(store, { type: SECTION });
  }
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

export function addParamInfo(store, sectionInfo, uiType, isNested = false) {
  const [uiTypeCollectionId, paramCollectionId, paramInfoId] = [
    createNewId(),
    createNewId(),
    createNewId(),
  ];
  const actions = store.getActions().paramInfos;
  actions.setUITypeId({
    collectionId: uiTypeCollectionId,
    paramInfoId,
    uiTypeId: uiType.id,
  });
  let child = null;
  if (isNested) {
    child = addSectionInfo(store, uiType);
    addChild(store, sectionInfo, child.id);
    actions.setChildId({
      collectionId: paramCollectionId,
      paramInfoId,
      childId: child.id,
    });
  }
  const output = { uiTypeCollectionId, paramCollectionId, paramInfoId };
  if (isNested) {
    output.childId = child.id;
  }
  return output;
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
