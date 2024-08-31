import _ from "lodash";
import { useEffect, useState } from "react";
import { sendMessage } from "requests/websocket";
import { setParamEnteredValue } from "state/actions/sectionVariants";
import { useInteractive } from "state/definitions";
import { useGetParamEnteredValue } from "state/hooks/sectionVariants";
import { createNewId } from "utils/idNameCreation";
import { ParamUI } from "../ParamUIs/ParamUI";

export function ParamInput({
  sectionId,
  paramInfoId,
  defaultVal,
  isDisabled,
  maybeErrorMessage,
  setDidUpdate,
}) {
  const enteredValue = useGetParamEnteredValue(sectionId, paramInfoId);
  const [value, setValue] = useState(enteredValue);

  // value and enteredValue should always be string
  function onChange(v) {
    const vStr = _.toString(v);
    setValue(vStr);
    debouncedSetParamEnteredValue(sectionId, paramInfoId, vStr, enteredValue);
    setDidUpdate(true);
    sendToInteractiveTasks(vStr);
  }

  useEffect(() => {
    if (value !== enteredValue) {
      setValue(enteredValue);
      setDidUpdate(true);
    }
  }, [enteredValue]);

  return (
    <ParamUI
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      defaultVal={defaultVal}
      onChange={onChange}
      isDisabled={isDisabled}
      maybeErrorMessage={maybeErrorMessage}
      sectionIdToBeActive={sectionId}
    />
  );
}

function sendToInteractiveTasks(v) {
  for (const t of useInteractive.getState().taskNames) {
    sendMessage({ id: createNewId(), content: v, messageType: t });
  }
}

const debouncedSetParamEnteredValue = _.debounce(
  (sectionId, paramInfoId, vStr, enteredValue, changedByUser = true) => {
    if (vStr !== enteredValue) {
      setParamEnteredValue({
        sectionId,
        paramInfoId,
        value: vStr,
        incrementVersion: changedByUser,
      });
    }
  },
  500,
);
