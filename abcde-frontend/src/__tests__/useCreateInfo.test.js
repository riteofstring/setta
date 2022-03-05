import { renderHook } from "@testing-library/react-hooks";
import { SectionInfo } from "classes/mutableInfo";
import { createStore, StoreProvider } from "easy-peasy";
import { useCreateDefaultSectionInfo } from "hooks/useCreateInfo";
import _ from "lodash";
import sectionInfos from "models/info/sectionInfos";

test("useCreateDefaultSectionInfo", () => {
  const store = createStore({ sectionInfos: sectionInfos });
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
