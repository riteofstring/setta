import { SectionInfo } from "classes/mutableInfo";
import { createStore } from "easy-peasy";
import sectionInfos from "models/info/sectionInfos";

function addInfo(store) {
  const si = new SectionInfo({});
  store.getActions().setSectionInfo((x) => ({ ...x, [si.id]: si }));
  return si;
}

function addChild(store, si, childId) {
  const newStateFn = (x) => [...x, childId];
  store.getActions().setIdsOverviewThunk({ sectionId: si.id, newStateFn });
}

test("setSectionInfo", () => {
  const store = createStore(sectionInfos);
  const si = addInfo(store);
  expect(store.getState().x[si.id]).toBe(si);
});

test("setIdsOverviewThunk", () => {
  const store = createStore(sectionInfos);
  const si = addInfo(store);
  const childId = "123456";
  addChild(store, si, childId);
  const childrenInfoId = store.getState().idsOverview[si.id];
  expect(store.getState().childrenInfo[childrenInfoId]).toEqual([childId]);
});

test("deleteSections", () => {
  const store = createStore(sectionInfos);
  const si1 = addInfo(store);
  const si2 = addInfo(store);
  addChild(store, si1, si2.id);
  store.getActions().deleteSections({ sectionIds: [si1.id] });
  expect(store.getState().x).toEqual({ [si2.id]: si2 });
  expect(store.getState().idsOverview).toEqual({});
  expect(store.getState().childrenInfo).toEqual({});
  expect(store.getState().currChildren).toEqual({});
});
