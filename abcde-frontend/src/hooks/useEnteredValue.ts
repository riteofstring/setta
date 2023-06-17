import { useEnteredValues } from "models/info/enteredValues";
import { useParamInfos } from "models/info/paramInfos";
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

export function useGetParamEnteredValueId(
  sectionId: string,
  paramInfoId: string
) {
  const evColId = useGetSectionInfo(sectionId, "evColId");
  return useParamInfos((x) => x.x[evColId][paramInfoId]);
}
