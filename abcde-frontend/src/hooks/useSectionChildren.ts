import { useIsRoot } from "hooks/useSectionType";
import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { useEffect } from "react";
import { setCurrChildren } from "thunks/sections";
import { useGetCurrObjParamKwargInfos } from "./useSectionContents";
import { useGetManySectionInfos } from "./useSectionInfo";

export function useGetAllChildren(sectionId: string) {
  return useSectionInfos((x) => x.allChildren[sectionId], _.isEqual);
}

export function useGetCurrChildren(sectionId: string) {
  const allChildrenIds = useGetAllChildren(sectionId);
  const allParamInfoIds = useGetManySectionInfos(allChildrenIds, "paramInfoId");
  const currParamChildIds = useChildIdHelper(
    sectionId,
    allChildrenIds,
    allParamInfoIds
  );
  const currChildren = useIsRoot(sectionId)
    ? // keep sections that aren't associated with any parameter
      allChildrenIds.filter((x, idx) => !allParamInfoIds[idx])
    : // keep sections that are associated with current parameters
      currParamChildIds;

  useEffect(() => {
    setCurrChildren({ sectionId, currChildren });
  }, [currChildren]);

  return currChildren;
}

function useChildIdHelper(
  sectionId: string,
  allChildrenIds: string[],
  allParamInfoIds: (string | null)[]
) {
  const currParamInfoIds = useGetCurrObjParamKwargInfos(sectionId).map(
    (x) => x.id
  );
  return _.intersection(allParamInfoIds, currParamInfoIds).map(
    (x, idx) => allChildrenIds[idx]
  );
}
