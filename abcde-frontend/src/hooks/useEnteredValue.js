import { useStoreActions, useStoreState } from "easy-peasy";
import _ from "lodash";
import { curryAction, defaultState } from "utils/utils";
import { useGetSectionConfig } from "./useSectionConfig";

export function useParamEnteredValue(sectionId, paramInfoId) {
  const enteredValueId = useGetParamEnteredValueId(sectionId, paramInfoId);
  const enteredValue = defaultState(
    useStoreState((x) => x.enteredValues.x[enteredValueId]?.value),
    () => ""
  );
  const setEnteredValue = curryAction(
    useStoreActions((x) => x.enteredValues.setEnteredValue),
    { enteredValueId },
    "value"
  );
  return [enteredValue, setEnteredValue];
}

export function useGetParamChildId(sectionId, paramInfoId) {
  const enteredValueId = useGetParamEnteredValueId(sectionId, paramInfoId);
  return useStoreState((x) => x.enteredValues.x[enteredValueId]?.childId);
}

export function useGetParamEnteredValueId(sectionId, paramInfoId) {
  const [evColId] = useGetSectionConfig(sectionId, ["evColId"]);
  return useStoreState((x) => x.paramInfos.x[evColId]?.[paramInfoId]);
}

export function useGetManyParamEVs(sectionId, paramInfos, key) {
  const [evColId] = useGetSectionConfig(sectionId, ["evColId"]);
  const enteredValueIds = useStoreState(
    (x) => paramInfos.map((y) => x.paramInfos.x[evColId]?.[y.id]),
    _.isEqual
  );
  return useStoreState(
    (x) => enteredValueIds.map((y) => x.enteredValues.x[y]?.[key]),
    _.isEqual
  );
}
