import { SectionInfo } from "classes/mutableInfo";
import { StoreProvider } from "easy-peasy";
import store, { resetEntireState } from "store/store";

export function createStore() {
  resetEntireState();
  return store;
}

export function addInfo(store) {
  const si = new SectionInfo({});
  store
    .getActions()
    .sectionInfos.setSectionInfo((x) => ({ ...x, [si.id]: si }));
  return si;
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
