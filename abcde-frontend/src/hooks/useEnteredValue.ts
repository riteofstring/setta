import { useEnteredValues } from "models/info/enteredValues";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionInfos } from "models/info/sectionInfos";
import { useGetSectionInfo } from "./useSectionInfo";

export function useGetParamEnteredValue(
  sectionId: string,
  paramInfoId: string
) {
  const enteredValueId = useGetParamEnteredValueId(sectionId, paramInfoId);
  return useEnteredValues((x) => x.x[enteredValueId].value);
}

export function useGetParamChildId(sectionId: string, paramInfoId: string) {
  const enteredValueId = useGetParamEnteredValueId(sectionId, paramInfoId);
  return useEnteredValues((x) => x.x[enteredValueId].childId);
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

export function useGetParamEnteredValueId(
  sectionId: string,
  paramInfoId: string
) {
  const evColId = useGetSectionInfo(sectionId, "evColId");
  return useParamInfos((x) => x.x[evColId][paramInfoId]);
}
