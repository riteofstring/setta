import { requiresNestedSection } from "abcde-utils/src/constants";
import { useIsRoot } from "hooks/useSectionType";
import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { useEffect } from "react";
import { setCurrChildren } from "thunks/sections/sections";
import { useGetManyParamUITypeIds } from "./useParamUIType";
import { useGetCurrObjParamKwargInfos } from "./useSectionContents";
import { useGetManySectionInfos } from "./useSectionInfo";

export function useHasNested(sectionId: string) {
  return useSectionInfos((x) => x.x[sectionId].currChildren?.length > 0);
}

export function useGetAllChildren(sectionId: string) {
  return useSectionInfos((x) => x.x[sectionId].children, _.isEqual);
}

export function useGetCurrChildren(sectionId: string) {
  const allChildrenIds = useGetAllChildren(sectionId);
  const allParamInfoIds = useGetManySectionInfos(allChildrenIds, "paramInfoId");
  const childrenRequiringNested = useChildrenRequiringNestedSection(
    sectionId,
    allParamInfoIds
  );
  const currChildren = useIsRoot(sectionId)
    ? // keep sections that aren't associated with any parameter
      allChildrenIds.filter((x, idx) => !allParamInfoIds[idx])
    : // keep sections that are associated with current parameters
      allChildrenIds.filter((x, idx) => childrenRequiringNested[idx]);

  useEffect(() => {
    setCurrChildren({ sectionId, currChildren });
  }, [currChildren]);

  return currChildren;
}

function useChildrenRequiringNestedSection(
  sectionId: string,
  allParamInfoIds: (string | null)[]
) {
  const currParamInfoIds = new Set(
    useGetCurrObjParamKwargInfos(sectionId).map((x) => x.id)
  );
  const isCurr = allParamInfoIds.map((x) => currParamInfoIds.has(x));
  const uiTypeIds = useGetManyParamUITypeIds(sectionId, allParamInfoIds, true);
  return useUITypes(
    (x) =>
      uiTypeIds.map(
        (u, idx) => isCurr[idx] && requiresNestedSection(x.x[u]?.type)
      ),
    _.isEqual
  );
}
