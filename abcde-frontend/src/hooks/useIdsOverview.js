import { useStoreState, useStoreActions } from "easy-peasy";
import { useGetSectionType } from "hooks/useSectionType";
import _ from "lodash";
import { useEffect } from "react";
import { isRoot } from "utils/constants";
import { requiresNestedSection } from "utils/constants";
import { defaultState } from "utils/utils";

import {
  useGetManyParamsWithParamCollectionId,
  useGetManyParamsWithUITypeCollectionId,
} from "./useParamInfo";
import { useGetCurrObjParamKwargInfos } from "./useSectionContents";

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

export function useSetIdsOverview(sectionId) {
  const fn = useStoreActions((x) => x.sectionInfos.setIdsOverviewThunk);
  return (newStateFn) => {
    return fn({ sectionId, newStateFn });
  };
}

export function useGetIdsOverview(sectionId) {
  const childrenInfoId = useStoreState(
    (x) => x.sectionInfos.idsOverview[sectionId]
  );
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
        requiresNestedSection(x.uiTypes.x[uiTypeIds[i]]?.type)
      ),
    _.isEqual
  );
  return useGetManyParamsWithParamCollectionId(sectionId, hasNested, "childId");
}
