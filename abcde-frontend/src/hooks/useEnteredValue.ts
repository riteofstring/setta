import _ from "lodash";
import { useEnteredValues } from "models/info/enteredValues";
import { useParamInfos } from "models/info/paramInfos";
import { curryAction, defaultState } from "utils/utils";
import { useGetSectionConfig } from "./useSectionConfig";

export function useParamEnteredValue(sectionId: string, paramInfoId: string) {
  const enteredValueId = useGetParamEnteredValueId(sectionId, paramInfoId);
  const enteredValue = defaultState(
    useEnteredValues((x) => x.x[enteredValueId]?.value),
    ""
  );
  const setEnteredValue = curryAction(
    useEnteredValues((x) => x.setEnteredValue),
    { enteredValueId },
    "value"
  );
  return [enteredValue, setEnteredValue];
}

export function useGetParamChildId(sectionId: string, paramInfoId: string) {
  const enteredValueId = useGetParamEnteredValueId(sectionId, paramInfoId);
  return useEnteredValues((x) => x.x[enteredValueId]?.childId);
}

export function useGetParamEnteredValueId(
  sectionId: string,
  paramInfoId: string
) {
  const evColId = useGetSectionConfig(sectionId, "evColId");
  return useParamInfos((x) => x.x[evColId]?.[paramInfoId]);
}

export function useGetManyParamEVs(sectionId, paramInfos, key) {
  const evColId = useGetSectionConfig(sectionId, "evColId");
  const enteredValueIds = useParamInfos(
    (x) => paramInfos.map((y) => x.x[evColId]?.[y.id]),
    _.isEqual
  );
  return useEnteredValues(
    (x) => enteredValueIds.map((y) => x.x[y]?.[key]),
    _.isEqual
  );
}
