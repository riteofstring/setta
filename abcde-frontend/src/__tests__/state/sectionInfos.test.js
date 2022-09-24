import { waitFor } from "@testing-library/react";
import { addSectionInfo, createStore } from "__tests__utils/utils";

test("setSectionInfo should add a section to sectionInfos using the correct key (its id)", () => {
  const store = createStore();
  const si = addSectionInfo(store);
  expect(store.getState().sectionInfos.x[si.id]).toBe(si);
});

test("setIdsOverview should add a child to a section's idsOverview list", () => {
  const store = createStore();
  const si = addSectionInfo(store);
  const childId = "123456";
  const newStateFn = (x) => [...x, childId];
  store
    .getActions()
    .sectionInfos.setIdsOverview({ sectionId: si.id, newStateFn });
  const state = store.getState().sectionInfos;
  expect(state.idsOverview[si.id]).toEqual([childId]);
});

test("deleting a section should delete its children too", () => {
  const store = createStore();
  const si1 = addSectionInfo(store);
  const si2 = addSectionInfo(store);
  store.getActions().thunks.addChild({ parentId: si1.id });
  waitFor(() => {
    store.getActions().sectionInfos.deleteSections({ sectionIds: [si1.id] });
  });
  const state = store.getState().sectionInfos;
  expect(state.x).toEqual({ [si2.id]: si2 });
  expect(state.idsOverview).toEqual({});
  expect(state.currChildren).toEqual({});
});
