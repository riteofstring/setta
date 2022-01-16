import { useStoreState, useStoreActions } from "easy-peasy";
import _ from "lodash";
import { useEffect } from "react";
import { isRoot } from "utils/constants";
import { requiresNestedSection } from "utils/constants";
import { createNewId } from "utils/sectionIds";
import { curryAction, defaultState } from "utils/utils";

import {
  useGetCurrObjParamKwargInfos,
  useGetManyParamsWithParamCollectionId,
  useGetManyParamsWithUITypeCollectionId,
  useGetSectionType,
} from "./useCreateInfo";

export function useIdsOverview(sectionId) {
  const idsOverview = useGetIdsOverview(sectionId);
  const setIdsOverview = useSetIdsOverview(sectionId);
  const setCurrChildren = useStoreActions(
    (x) => x.sectionInfos.setCurrChildren
  );
  useEffect(() => {
    setCurrChildren({ sectionId, currChildren: idsOverview });
  }, [idsOverview]);
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
  console.log("useGetCurrChildrenIds", sectionId);
  const { paramInfos, kwargInfos } = useGetCurrObjParamKwargInfos(sectionId);
  const paramChildIds = useChildIdHelper(paramInfos, sectionId);
  const kwargChildIds = useChildIdHelper(kwargInfos, sectionId);
  return [...paramChildIds, ...kwargChildIds];
}

function useChildIdHelper(infos, sectionId) {
  const uiTypeIds = useGetManyParamsWithUITypeCollectionId(
    sectionId,
    infos,
    "uiTypeId"
  );
  const hasNested = useStoreState(
    (x) =>
      infos.filter((y, i) =>
        requiresNestedSection(x.uiTypes.x[uiTypeIds[i]]?.name)
      ),
    _.isEqual
  );
  return useGetManyParamsWithParamCollectionId(sectionId, hasNested, "childId");
}
