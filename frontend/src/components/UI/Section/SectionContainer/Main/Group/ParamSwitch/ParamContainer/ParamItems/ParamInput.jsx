import { sendMessage } from "dbRequests/websocket";
import { useGetParamEnteredValue } from "hooks/useEnteredValue";
import _ from "lodash";
import { useProject } from "models/info/project";
import { useInteractive } from "models/interactive";
import { useCallback, useEffect, useState } from "react";
import { setParamEnteredValue } from "thunks/paramInfos";
import { ParamUI } from "../ParamUIs/ParamUI";

export function ParamInput({ sectionId, paramInfoId, defaultVal, isDisabled }) {
  const enteredValue = useGetParamEnteredValue(sectionId, paramInfoId);
  const [value, setValue] = useState(enteredValue);

  // value and enteredValue should always be string
  function onChange(v) {
    const vStr = _.toString(v);
    setValue(vStr);
    setEnteredValue(vStr);
    const interactive_state = useInteractive.getState();
    if (interactive_state.currProjectIsInteractive) {
      sendMessage({
        id: interactive_state.id,
        message: value,
        messageType: useProject.getState().name,
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
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      defaultVal={defaultVal}
      onChange={onChange}
      isDisabled={isDisabled}
      className="nodrag"
    />
  );
}
