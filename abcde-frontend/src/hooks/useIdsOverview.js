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
  if (needsNewId) {
    childrenInfoId = createNewId();
  }
  const setIdsOverview = useStoreActions((x) => x.sectionInfos.setIdsOverview);
  const setChildrenInfo = useSetChildrenInfo(childrenInfoId);

  return (newStateFn) => {
    if (needsNewId) {
      setIdsOverview({ sectionId, childrenInfoId });
    }
    return setChildrenInfo(newStateFn);
  };
}

export function useGetIdsOverview(sectionId) {
  const childrenInfoId = useGetChildrenInfoId(sectionId);
  const childrenId = useStoreState((x) => x.sectionInfos.childrenInfo[childrenInfoId])
  return defaultState(
    childrenId,
    () => []
  );
}

export function useGetChildrenInfoId(sectionId) {
  return useStoreState(
    (x) => x.sectionInfos.idsOverview[sectionId]
  );
}