import { SectionInfo } from "classes/mutableInfo";
import { createStore } from "easy-peasy";
import sectionInfos from "models/info/sectionInfos";

function createStoreAndAddInfo() {
  const store = createStore(sectionInfos);
  const si = new SectionInfo({});
  store.getActions().setSectionInfo((x) => ({ ...x, [si.id]: si }));
  return { store, si };
}

test("setSectionInfo", () => {
  const { store, si } = createStoreAndAddInfo();
  expect(store.getState().x[si.id]).toBe(si);
});

test("setIdsOverviewThunk", () => {
  const { store, si } = createStoreAndAddInfo();
  const newStateFn = (x) => [...x, "123456"];
  store.getActions().setIdsOverviewThunk({ sectionId: si.id, newStateFn });
  const childrenInfoId = store.getState().idsOverview[si.id];
  expect(store.getState().childrenInfo[childrenInfoId]).toEqual(["123456"]);
});
