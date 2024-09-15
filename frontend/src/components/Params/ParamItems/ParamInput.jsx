import C from "constants/constants.json";
import _ from "lodash";
import { useEffect, useState } from "react";
import { getKeywordPositionsAndEVRefs } from "requests/sections";
import { sendToInteractiveTasks } from "state/actions/interactive";
import {
  setParamEnteredValue,
  setParamKeywordPositions,
} from "state/actions/sectionVariants";
import { getParamUIType } from "state/actions/uiTypes/uiTypeCols";
import {
  useGetParamEnteredValue,
  useGetParamKeywordPositions,
} from "state/hooks/sectionVariants";
import useDeepCompareEffect from "use-deep-compare-effect";
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
    sendParamValueToInteractiveTasks(sectionId, paramInfoId, vStr);
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

function sendParamValueToInteractiveTasks(sectionId, paramInfoId, v) {
  sendToInteractiveTasks([sectionId, paramInfoId], v);
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
