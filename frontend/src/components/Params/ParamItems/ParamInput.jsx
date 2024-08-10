import C from "constants/constants.json";
import _ from "lodash";
import { useCallback, useEffect, useState } from "react";
import { sendMessage } from "requests/websocket";
import { setParamEnteredValue } from "state/actions/sectionVariants";
import { useInteractive, useProjectConfig } from "state/definitions";
import { useGetParamEnteredValue } from "state/hooks/sectionVariants";
import { useIdWaitingForLSPResult } from "state/hooks/lsp";
import { useGetParamUIType } from "state/hooks/uiTypes";
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
    setEnteredValue(vStr);
    const interactive_state = useInteractive.getState();
    if (interactive_state.currProjectIsInteractive) {
      sendMessage({
        id: interactive_state.id,
        content: value,
        messageType: useProjectConfig.getState().name,
      });
    }
    setDidUpdate(true);
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
    />
  );
}

function LoadingSpinner({ sectionId, paramInfoId }) {
  const waitingForResult = useIdWaitingForLSPResult({ sectionId, paramInfoId });
  return (
    waitingForResult && (
      <i className="section-value gg-spinner self-center justify-self-end text-blue-500/70" />
    )
  );
}
