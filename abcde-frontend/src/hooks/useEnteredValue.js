import { useStoreActions, useStoreState } from "easy-peasy";
import { createNewId, curryAction } from "utils/utils";
import { useParamEnteredValueId } from "./useParamInfo";

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
  const enteredValue = useStoreState((x) =>
    x.paramInfos.evInfo(sectionId, paramInfoId, "enteredValue")
  );
  const enteredValueId = useStoreState((x) =>
    x.paramInfos.enteredValueId(sectionId, paramInfoId)
  );
  const setEnteredValue = curryAction(
    useStoreActions((x) => x.enteredValues.setEnteredValue),
    { enteredValueId },
    "value"
  );
  return [enteredValue, setEnteredValue];
}
