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
import { useInteractive } from "state/definitions";
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
    sendToInteractiveTasks(sectionId, paramInfoId, vStr);
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
      onChange={onChange}
      maybeErrorMessage={maybeErrorMessage}
      keywordPositions={localKeywordPositions}
      setKeywordPositions={setLocalKeywordPositions}
    />
  );
}

function sendToInteractiveTasks(sectionId, paramInfoId, v) {
  const key = JSON.stringify([sectionId, paramInfoId]);
  const content = { [key]: v };
  for (const t of useInteractive.getState().taskMetadata) {
    if (t.runOnProjectChange && t.dependencies.has(key)) {
      sendMessage({ id: createNewId(), content, messageType: t.name });
    }
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
