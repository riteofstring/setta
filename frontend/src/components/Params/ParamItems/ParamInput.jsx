import C from "constants/constants.json";
import _ from "lodash";
import { useCallback, useEffect, useState } from "react";
import { sendMessage } from "requests/websocket";
import { setParamEnteredValue } from "state/actions/evCols";
import { useIdWaitingForLSPResult } from "state/actions/lsp";
import { useInteractive, useProject } from "state/definitions";
import { useGetParamEnteredValue } from "state/hooks/ev";
import { useGetParamUIType } from "state/hooks/uiTypes";
import { ParamUI } from "../ParamUIs/ParamUI";

export function ParamInput({
  sectionId,
  paramInfoId,
  defaultVal,
  isDisabled,
  maybeErrorMessage,
}) {
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
        content: value,
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
    [enteredValue],
  );

  const paramUIType = useGetParamUIType(sectionId, paramInfoId);
  const isText = paramUIType.type === C.TEXT;

  useEffect(() => {
    if (value !== enteredValue) {
      setValue(enteredValue);
    }
  }, [enteredValue]);

  return (
    <div
      className={`group/textinput contents ${maybeErrorMessage ? "[&_*]:!text-red-500" : ""}`}
    >
      <ParamUI
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        value={value}
        defaultVal={defaultVal}
        onChange={onChange}
        isDisabled={isDisabled}
      />
    </div>
  );
}

function LoadingSpinner({ sectionId, paramInfoId }) {
  const waitingForResult = useIdWaitingForLSPResult({ sectionId, paramInfoId });
  return (
    waitingForResult && (
      <i className="card-value gg-spinner self-center justify-self-end text-blue-500/70" />
    )
  );
}
