import { useStoreActions, useStoreState } from "easy-peasy";
import { useGetSectionType } from "hooks/useSectionType";
import _ from "lodash";
import { useEffect } from "react";
import { isRoot, requiresNestedSection } from "utils/constants";
import { defaultState } from "utils/utils";

import {
  useGetManyParamsWithParamCollectionId,
  useGetManyParamsWithUITypeColId,
} from "./useParamInfo";
import { useGetCurrObjParamKwargInfos } from "./useSectionContents";

export function useGetAllChildren(sectionId) {
  return defaultState(
    useStoreState((x) => x.sectionInfos.idsOverview[sectionId]),
    () => []
  );
}

export function useIdsOverview(sectionId) {
  const idsOverview = useGetIdsOverview(sectionId);
  const setCurrChildren = useStoreActions(
    (x) => x.sectionInfos.setCurrChildren
  );
  useEffect(() => {
    setCurrChildren({ sectionId, currChildren: idsOverview });
  }, [idsOverview]);
  return idsOverview;
}

function useGetIdsOverview(sectionId) {
  const allChildrenId = useGetAllChildren(sectionId);
  const currChildrenId = useGetCurrChildrenIds(sectionId);
  const sectionTypeName = useGetSectionType(sectionId).type;
  if (isRoot(sectionTypeName)) {
    return allChildrenId;
  }
  return _.intersection(allChildrenId, currChildrenId);
}

function useGetCurrChildrenIds(sectionId) {
  const paramInfos = useGetCurrObjParamKwargInfos(sectionId);
  return useChildIdHelper(paramInfos, sectionId);
}

function useChildIdHelper(infos, sectionId) {
  const uiTypeIds = useGetManyParamsWithUITypeColId(sectionId, infos);
  const hasNested = useStoreState(
    (x) =>
      infos.filter((y, i) =>
        requiresNestedSection(x.uiTypes.x[uiTypeIds[i]]?.type)
      ),
    _.isEqual
  );
  return useGetManyParamsWithParamCollectionId(sectionId, hasNested, "childId");
}
