import { loadTestData } from "./loadTestData";
import { createStore, getStoreProviderWrapper } from "./utils";

export function createStoreWrapperWithData() {
  const store = createStore();
  store.getActions().master.loadSections(loadTestData());
  return { store, wrapper: getStoreProviderWrapper(store) };
}
