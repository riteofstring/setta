import { useStoreState, useStoreActions } from "easy-peasy";

import { compatibleName } from "../utils/constants";
import { createNewId } from "../utils/sectionIds";
import { curryAction, defaultState } from "../utils/utils";
import { useGetSectionType } from "./useCreateInfo";

export function useIdsOverview(sectionId) {
  const idsOverview = useGetIdsOverview(sectionId);
  const setIdsOverview = useSetIdsOverview(sectionId);
  return [idsOverview, setIdsOverview];
}

export function useSetChildrenInfo(childrenInfoId) {
  return curryAction(
    useStoreActions((x) => x.sectionInfos.setChildrenInfo),
    { childrenInfoId },
    "newStateFn"
  );
}

export function useSetIdsOverview(sectionId) {
  let childrenInfoId = useGetChildrenInfoId(sectionId);
  let needsNewId = !childrenInfoId;
  const sectionTypeName = useGetSectionTypeName(sectionId);
  if (needsNewId) {
    childrenInfoId = createNewId();
  }
  const setIdsOverview = useStoreActions((x) => x.sectionInfos.setIdsOverview);
  const setUIInfo = useSetChildrenInfo(childrenInfoId);

  return (newStateFn) => {
    if (needsNewId) {
      setIdsOverview({ sectionId, sectionTypeName, childrenInfoId });
    }
    return setUIInfo(newStateFn);
  };
}

export function useGetIdsOverview(sectionId) {
  const childrenInfoId = useGetChildrenInfoId(sectionId);
  return defaultState(
    useStoreState((x) => x.sectionInfos.childrenInfo[childrenInfoId]),
    () => []
  );
}

export function useGetChildrenInfoId(sectionId) {
  const sectionTypeName = useGetSectionTypeName(sectionId);
  return useStoreState(
    (x) => x.sectionInfos.idsOverview[sectionId]?.[sectionTypeName]
  );
}

export function useGetSectionTypeName(sectionId) {
  return compatibleName(useGetSectionType(sectionId).name);
}
