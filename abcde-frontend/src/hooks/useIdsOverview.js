import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";

import { isRoot } from "../utils/constants";
import { requiresNestedSection } from "../utils/constants";
import { createNewId } from "../utils/sectionIds";
import { curryAction, defaultState } from "../utils/utils";
import {
  useGetCurrObjParamKwargInfos,
  useGetSectionType,
} from "./useCreateInfo";

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
  console.log("useGetIdsOverview", sectionId);
  const childrenInfoId = useGetChildrenInfoId(sectionId);
  const allChildrenId = defaultState(
    useStoreState((x) => x.sectionInfos.childrenInfo[childrenInfoId]),
    () => []
  );
  const renderedChildren = useStoreState(
    (x) => allChildrenId.filter((y) => x.sectionInfos.x[y].isRendered),
    _.isEqual
  );
  return renderedChildren;
}

export function useGetChildrenInfoId(sectionId) {
  return useStoreState((x) => x.sectionInfos.idsOverview[sectionId]);
}
