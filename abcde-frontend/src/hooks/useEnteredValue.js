import { useStoreState, useStoreActions } from "easy-peasy";
import { createNewId } from "utils/sectionIds";
import { curryAction, defaultState } from "utils/utils";

import { useParamEnteredValueId } from "./useParamInfo";
import { getInfo } from "./utils";

export function useInitializeEnteredValue(sectionId) {
  const enteredValueIdFn = useParamEnteredValueId(sectionId);
  const setEnteredValue = useStoreActions(
    (x) => x.enteredValues.setEnteredValue
  );
  return (paramInfo) => {
    const [enteredValueId, setEnteredValueId] = enteredValueIdFn(paramInfo.id);
    return () => {
      if (!enteredValueId) {
        const newId = createNewId();
        setEnteredValueId(newId);
        setEnteredValue({ enteredValueId: newId, value: "" });
      }
    };
  };
}

export function useParamEnteredValue(sectionId) {
  const enteredValueIdFn = useParamEnteredValueId(sectionId);
  return (paramInfo) => {
    const enteredValueId = enteredValueIdFn(paramInfo.id)[0];
    const enteredValue = defaultState(
      useStoreState((x) => getInfo(x.enteredValues)[enteredValueId]),
      () => ""
    );
    const setEnteredValue = curryAction(
      useStoreActions((x) => x.enteredValues.setEnteredValue),
      { enteredValueId },
      "value"
    );
    return [enteredValue, setEnteredValue];
  };
}
