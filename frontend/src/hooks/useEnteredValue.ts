import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
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
  const selectedItem = useGetSectionInfo(sectionId, "selectedItem");
  const objName = useCodeInfo((x) =>
    selectedItem ? x.x[selectedItem].name : ""
  );
  const paramName = useCodeInfo((x) => x.x[paramInfoId].name);
  const evColId = useGetSectionInfo(sectionId, "evColId");
  return useParamInfos((x) => x.x[evColId][objName][paramName]);
}
