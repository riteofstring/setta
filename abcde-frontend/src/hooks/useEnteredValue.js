import { useStoreActions, useStoreState } from "easy-peasy";
import { createNewId, curryAction, defaultState } from "utils/utils";

import {
  useGetParamEnteredValueId,
  useParamEnteredValueId,
} from "./useParamInfo";

export function useInitializeEnteredValue(sectionId) {
  const enteredValueIdFn = useParamEnteredValueId(sectionId);
  const setEnteredValue = useStoreActions(
    (x) => x.enteredValues.setEnteredValue
  );
  return (paramInfoId) => {
    const [enteredValueId, setEnteredValueId] = enteredValueIdFn(paramInfoId);
    return () => {
      if (!enteredValueId) {
        const newId = createNewId();
        setEnteredValueId(newId);
        setEnteredValue({ enteredValueId: newId, value: null });
      }
    };
  };
}

export function useParamEnteredValue(sectionId, paramInfoId) {
  const enteredValueId = useGetParamEnteredValueId(sectionId, paramInfoId);
  const enteredValue = defaultState(
    useStoreState((x) => x.enteredValues.x[enteredValueId]?.enteredValue),
    () => ""
  );
  const setEnteredValue = curryAction(
    useStoreActions((x) => x.enteredValues.setEnteredValue),
    { enteredValueId },
    "value"
  );
  return [enteredValue, setEnteredValue];
}
