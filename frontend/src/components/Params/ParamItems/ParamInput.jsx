import _ from "lodash";
import { useCallback, useEffect, useState } from "react";
import { sendMessage } from "requests/websocket";
import { setParamEnteredValue } from "state/actions/sectionVariants";
import { useInteractive } from "state/definitions";
import {
  useGetParamEnteredValue,
  useGetParamKeywordPositions,
} from "state/hooks/sectionVariants";
import useDeepCompareEffect from "use-deep-compare-effect";
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
  const keywordPositions = useGetParamKeywordPositions(sectionId, paramInfoId);
  const [localValue, setLocalValue] = useState(enteredValue);
  const [localKeywordPositions, setLocalKeywordPositions] =
    useState(keywordPositions);

  console.log("localKeywordPositions", localKeywordPositions)

  // value and enteredValue should always be string
  function onChange(v) {
    const vStr = _.toString(v);
    setLocalValue(vStr);
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
        // if (getParamUIType(sectionId, paramInfoId) === C.TEXT) {
        //   const keywordPositions = await getKeywordPositionsAndEVRefs({
        //     sectionId,
        //     paramInfoId,
        //     fullText: vStr,
        //   });
        //   setParamKeywordPositions({
        //     sectionId,
        //     paramInfoId,
        //     keywordPositions,
        //   });
        // }
      }
    }, 100),
    [enteredValue],
  );

  useEffect(() => {
    if (localValue !== enteredValue) {
      setLocalValue(enteredValue);
      setDidUpdate(true);
    }
  }, [enteredValue]);

  useDeepCompareEffect(() => {
    if (!_.isEqual(localKeywordPositions, keywordPositions)) {
      setLocalKeywordPositions(keywordPositions);
    }
  }, [keywordPositions]);

  return (
    <ParamUI
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={localValue}
      defaultVal={defaultVal}
      onChange={onChange}
      isDisabled={isDisabled}
      maybeErrorMessage={maybeErrorMessage}
      sectionIdToBeActive={sectionId}
      keywordPositions={localKeywordPositions}
      setKeywordPositions={setLocalKeywordPositions}
    />
  );
}

function sendToInteractiveTasks(v) {
  for (const t of useInteractive.getState().taskNames) {
    sendMessage({ id: createNewId(), content: v, messageType: t });
  }
}
