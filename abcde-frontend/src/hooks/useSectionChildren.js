import { useStoreActions, useStoreState } from "easy-peasy";
import { useGetSectionType } from "hooks/useSectionType";
import _ from "lodash";
import { useEffect } from "react";
import { isRoot, requiresNestedSection } from "utils/constants";
import { defaultState } from "utils/utils";
import { useGetManyParamEVs } from "./useEnteredValue";
import { useGetManyParamUITypeIds } from "./useParamUIType";
import { useGetCurrObjParamKwargInfos } from "./useSectionContents";

export function useGetAllChildren(sectionId) {
  return defaultState(
    useStoreState((x) => x.sectionInfos.allChildren[sectionId]),
    () => []
  );
}

export function useGetCurrChildren(sectionId) {
  const allChildrenIds = useGetAllChildren(sectionId);
  const currParamChildIds = useChildIdHelper(sectionId);
  const [sectionTypeName] = useGetSectionType(sectionId, ["type"]);
  const currChildren = isRoot(sectionTypeName)
    ? allChildrenIds
    : _.intersection(allChildrenIds, currParamChildIds);

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
  const uiTypeIds = useGetManyParamUITypeIds(sectionId, infos);
  const hasNested = useStoreState(
    (x) =>
      infos.filter((y, i) =>
        requiresNestedSection(x.uiTypes.x[uiTypeIds[i]]?.type)
      ),
    _.isEqual
  );
  return useGetManyParamEVs(sectionId, hasNested, "childId");
}
