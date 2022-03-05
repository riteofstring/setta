import { SectionInfo } from "classes/mutableInfo";

export function addInfo(store) {
  const si = new SectionInfo({});
  store
    .getActions()
    .sectionInfos.setSectionInfo((x) => ({ ...x, [si.id]: si }));
  return si;
}

export function addChild(store, si, childId) {
  const newStateFn = (x) => [...x, childId];
  store
    .getActions()
    .sectionInfos.setIdsOverviewThunk({ sectionId: si.id, newStateFn });
}
