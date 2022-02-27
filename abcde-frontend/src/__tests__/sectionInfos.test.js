import { SectionInfo } from "classes/mutableInfo";
import { createStore } from "easy-peasy";
import sectionInfos from "models/info/sectionInfos";

test("setSectionInfo", () => {
  const store = createStore(sectionInfos);
  const si = new SectionInfo({});
  store.getActions().setSectionInfo((x) => ({ ...x, [si.id]: si }));
  expect(store.getState().x[si.id]).toBe(si);
});
