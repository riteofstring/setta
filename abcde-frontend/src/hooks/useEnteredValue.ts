import { useEnteredValues } from "models/info/enteredValues";
import { useParamInfos } from "models/info/paramInfos";
import { curryAction } from "utils/utils";
import { useGetSectionConfig } from "./useSectionConfig";

export function useParamEnteredValue(sectionId: string, paramInfoId: string) {
  const enteredValueId = useGetParamEnteredValueId(sectionId, paramInfoId);
  const enteredValue = useEnteredValues((x) => x.x[enteredValueId].value);

  const setEnteredValue = curryAction(
    useEnteredValues((x) => x.setEnteredValue),
    { enteredValueId },
    "value"
  );
  return { enteredValue, setEnteredValue };
}

export function useGetParamChildId(sectionId: string, paramInfoId: string) {
  const enteredValueId = useGetParamEnteredValueId(sectionId, paramInfoId);
  return useEnteredValues((x) => x.x[enteredValueId].childId);
}

export function useGetParamEnteredValueId(
  sectionId: string,
  paramInfoId: string
) {
  const evColId = useGetSectionConfig(sectionId, "evColId");
  return useParamInfos((x) => x.x[evColId][paramInfoId]);
}
