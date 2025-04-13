import _ from "lodash";
import { useEffect, useRef, useState } from "react";
import { debouncedTypeCheckRequest } from "requests/sections";
import { cancelableSetParamEnteredValue } from "state/actions/sectionInfos";
import { useSendToInteractiveTasks } from "state/hooks/interactive";
import { useGetParamEnteredValueAndEVRefs } from "state/hooks/sectionVariants";
import { asyncDebounce } from "utils/utils";
import { ParamUI } from "../ParamUIs/ParamUI";

export function ParamInput({ sectionId, paramInfoId, maybeErrorMessage }) {
  const { value: enteredValue, evRefs } = useGetParamEnteredValueAndEVRefs(
    sectionId,
    paramInfoId,
  );
  const [value, setValue] = useState(enteredValue);
  const sendToInteractiveTasksFn = useSendToInteractiveTasks([
    sectionId,
    paramInfoId,
  ]);
  const abortController = useRef();

  // value and enteredValue should always be string
  function onChange(v) {
    const vStr = _.toString(v);
    setValue(vStr);
    abortController.current?.abort();
    debouncedSetParamEnteredValue(
      sectionId,
      paramInfoId,
      vStr,
      abortController,
    );
    debouncedTypeCheckRequest();
    sendToInteractiveTasksFn(vStr);
  }

  useEffect(() => {
    if (value !== enteredValue) {
      setValue(enteredValue);
    }
  }, [enteredValue]);

  return (
    <ParamUI
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
      maybeErrorMessage={maybeErrorMessage}
      evRefs={evRefs}
    />
  );
}

const debouncedSetParamEnteredValue = asyncDebounce(
  async (sectionId, paramInfoId, vStr, abortControllerRef) => {
    const ac = new AbortController();
    abortControllerRef.current = ac;
    await cancelableSetParamEnteredValue({ sectionId, paramInfoId, vStr, ac });
  },
  50,
);
