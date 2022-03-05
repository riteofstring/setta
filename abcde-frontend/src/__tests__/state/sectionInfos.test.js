import { addInfo, addChild } from "__tests__utils/utils";
import { createStore } from "easy-peasy";
import sectionInfos from "models/info/sectionInfos";

test("setSectionInfo", () => {
  const store = createStore({ sectionInfos });
  const si = addInfo(store);
  expect(store.getState().sectionInfos.x[si.id]).toBe(si);
});

test("setIdsOverviewThunk", () => {
  const store = createStore({ sectionInfos });
  const si = addInfo(store);
  const childId = "123456";
  addChild(store, si, childId);
  const childrenInfoId = store.getState().sectionInfos.idsOverview[si.id];
  expect(store.getState().sectionInfos.childrenInfo[childrenInfoId]).toEqual([
    childId,
  ]);
});

test("deleting a section should delete its children too", () => {
  const store = createStore({ sectionInfos });
  const si1 = addInfo(store);
  const si2 = addInfo(store);
  const si3 = addInfo(store);
  addChild(store, si1, si2.id);
  store.getActions().sectionInfos.deleteSections({ sectionIds: [si1.id] });
  expect(store.getState().sectionInfos.x).toEqual({ [si3.id]: si3 });
  expect(store.getState().sectionInfos.idsOverview).toEqual({});
  expect(store.getState().sectionInfos.childrenInfo).toEqual({});
  expect(store.getState().sectionInfos.currChildren).toEqual({});
});
