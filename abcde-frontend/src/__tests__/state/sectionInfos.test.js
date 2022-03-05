import { addSectionInfo, addChild, createStore } from "__tests__utils/utils";

test("setSectionInfo", () => {
  const store = createStore();
  const si = addSectionInfo(store);
  expect(store.getState().sectionInfos.x[si.id]).toBe(si);
});

test("setIdsOverviewThunk", () => {
  const store = createStore();
  const si = addSectionInfo(store);
  const childId = "123456";
  addChild(store, si, childId);
  const state = store.getState().sectionInfos;
  const childrenInfoId = state.idsOverview[si.id];
  expect(state.childrenInfo[childrenInfoId]).toEqual([childId]);
});

test("deleting a section should delete its children too", () => {
  const store = createStore();
  const si1 = addSectionInfo(store);
  const si2 = addSectionInfo(store);
  const si3 = addSectionInfo(store);
  addChild(store, si1, si2.id);
  store.getActions().sectionInfos.deleteSections({ sectionIds: [si1.id] });
  const state = store.getState().sectionInfos;
  expect(state.x).toEqual({ [si3.id]: si3 });
  expect(state.idsOverview).toEqual({});
  expect(state.childrenInfo).toEqual({});
  expect(state.currChildren).toEqual({});
});
