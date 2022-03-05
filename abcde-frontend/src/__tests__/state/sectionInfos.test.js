import { renderHook } from "@testing-library/react-hooks";
import { addSectionInfo, createStore, getStoreProviderWrapper } from "__tests__utils/utils";
import { useAddChild } from "hooks/useAddDeleteChild";
import { act } from "react-dom/test-utils";

test("setSectionInfo", () => {
  const store = createStore();
  const si = addSectionInfo(store);
  expect(store.getState().sectionInfos.x[si.id]).toBe(si);
});

test("setIdsOverviewThunk", () => {
  const store = createStore();
  const si = addSectionInfo(store);
  const childId = "123456";
  const newStateFn = (x) => [...x, childId];
  store
    .getActions()
    .sectionInfos.setIdsOverviewThunk({ sectionId: si.id, newStateFn });
  const state = store.getState().sectionInfos;
  const childrenInfoId = state.idsOverview[si.id];
  expect(state.childrenInfo[childrenInfoId]).toEqual([childId]);
});

test("deleting a section should delete its children too", () => {
  const store = createStore();
  const wrapper = getStoreProviderWrapper(store);
  const si1 = addSectionInfo(store);
  const si2 = addSectionInfo(store);
  const { result } = renderHook(() => useAddChild(si1.id), { wrapper });
  act(() => result.current({}));
  store.getActions().sectionInfos.deleteSections({ sectionIds: [si1.id] });
  const state = store.getState().sectionInfos;
  expect(state.x).toEqual({ [si2.id]: si2 });
  expect(state.idsOverview).toEqual({});
  expect(state.childrenInfo).toEqual({});
  expect(state.currChildren).toEqual({});
});
