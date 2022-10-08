import { useStoreActions, useStoreState } from "easy-peasy";
import { curryAction, defaultState } from "utils/utils";
import { useGetParamEnteredValueId } from "./useParamInfo";

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
