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
  const childrenInfoId = useGetChildrenInfoId(sectionId);
  const allChildrenId = defaultState(
    useStoreState((x) => x.sectionInfos.childrenInfo[childrenInfoId]),
    () => []
  );
  const currChildrenId = useGetCurrChildrenIds(sectionId);
  const sectionTypeName = useGetSectionType(sectionId).name;
  if (isRoot(sectionTypeName)) {
    return allChildrenId;
  }
  return _.intersection(allChildrenId, currChildrenId);
}

export function useGetChildrenInfoId(sectionId) {
  return useStoreState((x) => x.sectionInfos.idsOverview[sectionId]);
}

export function useGetCurrChildrenIds(sectionId) {
  const childIds = defaultState(
    useStoreState((x) => x.paramInfos.childIds[sectionId]),
    () => ({})
  );
  const uiTypeIds = defaultState(
    useStoreState((x) => x.paramInfos.uiTypeIds[sectionId]),
    () => ({})
  );
  const uiTypes = useStoreState((x) => x.uiTypes.x);
  const { paramInfos, kwargInfos } = useGetCurrObjParamKwargInfos(sectionId);
  const paramChildIds = childIdHelper(paramInfos, childIds, uiTypeIds, uiTypes);
  const kwargChildIds = childIdHelper(kwargInfos, childIds, uiTypeIds, uiTypes);
  return [...paramChildIds, ...kwargChildIds];
}

function childIdHelper(infos, allChildIds, allUITypeIds, allUITypes) {
  const hasNested = infos.filter((x) =>
    requiresNestedSection(allUITypes[allUITypeIds[x.id]]?.name)
  );
  return _.map(hasNested, (x) => allChildIds[x.id]);
}
