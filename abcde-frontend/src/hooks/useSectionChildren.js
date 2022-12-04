import { useGetSectionType } from "hooks/useSectionType";
import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { useEffect } from "react";
import { setCurrChildren } from "thunks/sections";
import { isRoot, requiresNestedSection } from "utils/constants";
import { defaultState } from "utils/utils";
import { useGetManyParamEVs } from "./useEnteredValue";
import { useGetManyParamUITypeIds } from "./useParamUIType";
import { useGetCurrObjParamKwargInfos } from "./useSectionContents";
import { useGetManySectionInfos } from "./useSectionInfo";

export function useGetAllChildren(sectionId) {
  return defaultState(
    useSectionInfos((x) => x.allChildren[sectionId]),
    () => []
  );
}

export function useGetCurrChildren(sectionId) {
  const allChildrenIds = useGetAllChildren(sectionId);
  const allParamInfoIds = useGetManySectionInfos(allChildrenIds, [
    "paramInfoId",
  ]);
  const currParamChildIds = useChildIdHelper(sectionId);
  const [sectionTypeName] = useGetSectionType(sectionId, ["type"]);
  const currChildren = isRoot(sectionTypeName)
    ? // keep sections that aren't associated with any parameter
      allChildrenIds.filter((x, idx) => !allParamInfoIds[idx][0])
    : // keep sections that are associated with current parameters
      _.intersection(allChildrenIds, currParamChildIds);

  useEffect(() => {
    setCurrChildren({ sectionId, currChildren });
  }, [currChildren]);

  return currChildren;
}

function useChildIdHelper(sectionId) {
  const infos = useGetCurrObjParamKwargInfos(sectionId);
  const uiTypeIds = useGetManyParamUITypeIds(sectionId, infos);
  const hasNested = useUITypes(
    (x) =>
      infos.filter((y, i) => requiresNestedSection(x.x[uiTypeIds[i]]?.type)),
    _.isEqual
  );
  return useGetManyParamEVs(sectionId, hasNested, "childId");
}
