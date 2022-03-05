import { renderHook } from "@testing-library/react-hooks";
import { createStore } from "__tests__utils/utils";
import { SectionInfo } from "classes/mutableInfo";
import { StoreProvider } from "easy-peasy";
import { useCreateDefaultSectionInfo } from "hooks/useCreateInfo";
import _ from "lodash";

test("useCreateDefaultSectionInfo", () => {
  const store = createStore();
  const wrapper = ({ children }) => (
    <StoreProvider store={store}>{children}</StoreProvider>
  );
  const { result } = renderHook(() => useCreateDefaultSectionInfo(), {
    wrapper,
  });

  for (let x of _.range(10)) {
    const [newId] = result.current();
    expect(store.getState().sectionInfos.x[newId]).toBeInstanceOf(SectionInfo);
    expect(_.size(store.getState().sectionInfos.x)).toEqual(x + 1);
  }
});
