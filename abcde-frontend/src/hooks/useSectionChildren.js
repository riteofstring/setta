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
    useStoreState((x) => x.sectionInfos.allChildren[sectionId]),
    () => []
  );
}

export function useGetCurrChildren(sectionId) {
  const allChildrenId = useGetAllChildren(sectionId);
  const currChildrenId = useChildIdHelper(sectionId);
  const sectionTypeName = useGetSectionType(sectionId).type;
  const currChildren = isRoot(sectionTypeName)
    ? allChildrenId
    : _.intersection(allChildrenId, currChildrenId);

  const setCurrChildren = useStoreActions(
    (x) => x.sectionInfos.setCurrChildren
  );
  useEffect(() => {
    setCurrChildren({ sectionId, currChildren });
  }, [currChildren]);

  return currChildren;
}

function useChildIdHelper(sectionId) {
  const infos = useGetCurrObjParamKwargInfos(sectionId);
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
