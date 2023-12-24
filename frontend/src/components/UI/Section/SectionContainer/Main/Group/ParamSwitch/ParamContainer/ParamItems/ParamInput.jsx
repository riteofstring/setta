import { sendMessage } from "dbRequests/websocket";
import { useGetParamEnteredValue } from "hooks/useEnteredValue";
import _ from "lodash";
import { useInteractive } from "models/interactive";
import { useCallback, useEffect, useState } from "react";
import { setParamEnteredValue } from "thunks/paramInfos";
import { createNewId } from "z_utils/utils";
import { ParamUI } from "../ParamUIs/ParamUI";

export function ParamInput({
  sectionId,
  paramInfoId,
  defaultVal,
  uiType,
  isDisabled,
}) {
  const enteredValue = useGetParamEnteredValue(sectionId, paramInfoId);
  const [value, setValue] = useState(enteredValue);

  // value and enteredValue should always be string
  function onChange(v) {
    const vStr = _.toString(v);
    setValue(vStr);
    setEnteredValue(vStr);
    if (useInteractive.getState().currProjectIsInteractive) {
      sendMessage({
        id: createNewId(),
        message: "interactive message!",
        messageType: "interactive",
      });
    }
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
    [enteredValue]
  );

  useEffect(() => {
    if (value !== enteredValue) {
      setValue(enteredValue);
    }
  }, [enteredValue]);

  return (
    <ParamUI
      name={uiType.type}
      childProps={{
        sectionId,
        paramInfoId,
        value,
        defaultVal,
        onChange,
        isDisabled,
        className: "nodrag",
        ...uiType.config,
      }}
    />
  );
}
