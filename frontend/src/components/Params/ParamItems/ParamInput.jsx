import C from "constants/constants.json";
import _ from "lodash";
import { useEffect, useState } from "react";
import { getKeywordPositionsAndEVRefs } from "requests/sections";
import { sendMessage } from "requests/websocket";
import {
  setParamEnteredValue,
  setParamKeywordPositions,
} from "state/actions/sectionVariants";
import { getParamUIType } from "state/actions/uiTypes/uiTypeCols";
import { useCodeInfo, useInteractive } from "state/definitions";
import {
  useGetParamEnteredValue,
  useGetParamKeywordPositions,
} from "state/hooks/sectionVariants";
import useDeepCompareEffect from "use-deep-compare-effect";
import { createNewId } from "utils/idNameCreation";
import { asyncDebounce } from "utils/utils";
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
  const [value, setValue] = useState(enteredValue);
  const [localKeywordPositions, setLocalKeywordPositions] =
    useState(keywordPositions);

  // value and enteredValue should always be string
  function onChange(v) {
    const vStr = _.toString(v);
    setValue(vStr);
    debouncedSetParamEnteredValue(sectionId, paramInfoId, vStr, enteredValue);
    setDidUpdate(true);
    sendToInteractiveTasks(paramInfoId, vStr);
  }

  useEffect(() => {
    if (value !== enteredValue) {
      setValue(enteredValue);
      setDidUpdate(true);
    }
  }, [enteredValue]);

  useDeepCompareEffect(() => {
    setLocalKeywordPositions(keywordPositions);
  }, [keywordPositions]);

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
      keywordPositions={localKeywordPositions}
      setKeywordPositions={setLocalKeywordPositions}
    />
  );
}

function sendToInteractiveTasks(paramInfoId, v) {
  const content = { [useCodeInfo.getState().x[paramInfoId].name]: v };
  for (const t of useInteractive.getState().taskNames) {
    sendMessage({ id: createNewId(), content, messageType: t });
  }
}

const debouncedSetParamEnteredValue = asyncDebounce(
  async (sectionId, paramInfoId, vStr, enteredValue, changedByUser = true) => {
    if (vStr !== enteredValue) {
      setParamEnteredValue({
        sectionId,
        paramInfoId,
        value: vStr,
        incrementVersion: changedByUser,
      });
      if (getParamUIType(sectionId, paramInfoId).type === C.TEXT) {
        const { keywordPositions } = await getKeywordPositionsAndEVRefs({
          sectionId,
          paramInfoId,
          fullText: vStr,
          messageIdSuffix: "-paramInput",
        });
        console.log("debouncedSetParamEnteredValue", keywordPositions);
        setParamKeywordPositions({ sectionId, paramInfoId, keywordPositions });
      }
    }
  },
  500,
);
