import { renderHook } from "@testing-library/react";
import { SectionInfo } from "classes/mutableInfo";
import { useCreateDefaultSectionInfo } from "hooks/useCreateInfo";
import _ from "lodash";
import { createStore, getStoreProviderWrapper } from "__tests__utils/utils";

test("useCreateDefaultSectionInfo should add a new section to sectionInfos", () => {
  const store = createStore();
  const wrapper = getStoreProviderWrapper(store);
  const { result } = renderHook(() => useCreateDefaultSectionInfo(), {
    wrapper,
  });

  for (let x of _.range(10)) {
    const [newId] = result.current();
    expect(store.getState().sectionInfos.x[newId]).toBeInstanceOf(SectionInfo);
    expect(_.size(store.getState().sectionInfos.x)).toEqual(x + 1);
  }
});
