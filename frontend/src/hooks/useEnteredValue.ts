import _ from "lodash";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionInfos } from "models/info/sectionInfos";
import { useGetSectionInfo } from "./useSectionInfo";

export function useGetParamChildId(sectionId: string, paramInfoId: string) {
  // find section that has sectionId as parent and is associated with paramInfoId
  return useSectionInfos(
    (x) =>
      _.find(
        x.x,
        (v) => v.parentId === sectionId && v.paramInfoId === paramInfoId
      )?.id
  );
}

export function useGetParamChildNonPresetUITypeIds(
  sectionId: string,
  paramInfoId: string
) {
  const childId = useGetParamChildId(sectionId, paramInfoId);
  return useSectionInfos((x) =>
    childId ? x.x[childId].nonPresetUITypeIds : []
  );
}

export function useGetParamEnteredValue(
  sectionId: string,
  paramInfoId: string
) {
  const evColId = useGetSectionInfo(sectionId, "evColId");
  return useParamInfos((x) => x.x[evColId][paramInfoId]);
}
