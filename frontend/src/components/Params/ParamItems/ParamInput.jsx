import _ from "lodash";
import { useCallback, useEffect, useState } from "react";
import { sendMessage } from "requests/websocket";
import { setParamEnteredValue } from "state/actions/sectionVariants";
import { useInteractive } from "state/definitions";
import { useGetParamEnteredValue } from "state/hooks/sectionVariants";
import { ParamUI } from "../ParamUIs/ParamUI";
import { createNewId } from "utils/idNameCreation";

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
    setEnteredValue(vStr);
    setDidUpdate(true);
    sendToInteractiveTasks(vStr);
  }

  const setEnteredValue = useCallback(
    _.debounce((vStr, changedByUser = true) => {
      if (vStr !== enteredValue) {
        setParamEnteredValue({
          sectionId,
          paramInfoId,
          value: vStr,
          incrementVersion: changedByUser,
        });
      }
    }, 500),
    [enteredValue],
  );

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
