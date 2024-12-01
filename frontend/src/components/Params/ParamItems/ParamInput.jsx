import C from "constants/constants.json";
import _ from "lodash";
import { useEffect, useState } from "react";
import {
  debouncedTypeCheckRequest,
  getKeywordPositionsAndEVRefs,
} from "requests/sections";
import { sendToInteractiveTasks } from "state/actions/interactive";
import { setParamEnteredValue } from "state/actions/sectionInfos";
import { getParamUIType } from "state/actions/uiTypes/uiTypeCols";
import { useSectionInfos } from "state/definitions";
import { useGetParamEnteredValueAndKeywordPositions } from "state/hooks/sectionVariants";
import useDeepCompareEffect from "use-deep-compare-effect";
import { asyncDebounce } from "utils/utils";
import { ParamUI } from "../ParamUIs/ParamUI";

export function ParamInput({ sectionId, paramInfoId, maybeErrorMessage }) {
  const { value: enteredValue, keywordPositions } =
    useGetParamEnteredValueAndKeywordPositions(sectionId, paramInfoId);
  const [value, setValue] = useState(enteredValue);
  const [localKeywordPositions, setLocalKeywordPositions] =
    useState(keywordPositions);

  // value and enteredValue should always be string
  function onChange(v) {
    const vStr = _.toString(v);
    setValue(vStr);
    debouncedSetParamEnteredValue(sectionId, paramInfoId, vStr, enteredValue);
    debouncedTypeCheckRequest();
    sendParamValueToInteractiveTasks(sectionId, paramInfoId, vStr);
  }

  useEffect(() => {
    if (value !== enteredValue) {
      setValue(enteredValue);
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
      useSectionInfos.setState((state) => {
        setParamEnteredValue(sectionId, paramInfoId, vStr, state);
      });

      if (getParamUIType(sectionId, paramInfoId).type === C.TEXT) {
        const { keywordPositions } = await getKeywordPositionsAndEVRefs({
          sectionId,
          paramInfoId,
          fullText: vStr,
        });
        console.log("debouncedSetParamEnteredValue", keywordPositions);

        useSectionInfos.setState((state) => {
          const { variantId } = state.x[sectionId];
          state.variants[variantId].values[paramInfoId].keywordPositions =
            keywordPositions;
        });
      }
    }
  },
  50,
);
