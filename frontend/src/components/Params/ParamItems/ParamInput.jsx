import C from "constants/constants.json";
import _ from "lodash";
import { useEffect, useState } from "react";
import { debouncedTypeCheckRequest, getEVRefs } from "requests/sections";
import { sendToInteractiveTasks } from "state/actions/interactive";
import { setParamEnteredValue } from "state/actions/sectionInfos";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos } from "state/definitions";
import { useGetParamEnteredValueAndEVRefs } from "state/hooks/sectionVariants";
import { getParamUIType } from "state/hooks/uiTypes";
import { asyncDebounce } from "utils/utils";
import { ParamUI } from "../ParamUIs/ParamUI";

export function ParamInput({ sectionId, paramInfoId, maybeErrorMessage }) {
  const { value: enteredValue, evRefs } = useGetParamEnteredValueAndEVRefs(
    sectionId,
    paramInfoId,
  );
  const [value, setValue] = useState(enteredValue);

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

  return (
    <ParamUI
      sectionId={sectionId}
      paramInfoId={paramInfoId}
      value={value}
      onChange={onChange}
      maybeErrorMessage={maybeErrorMessage}
      evRefs={evRefs}
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
        const evRefs = await getEVRefs({
          sectionId,
          paramInfoId,
          fullText: vStr,
        });
        console.log("debouncedSetParamEnteredValue", evRefs);

        useSectionInfos.setState((state) => {
          const { variantId } = state.x[sectionId];
          state.variants[variantId].values[paramInfoId].evRefs = evRefs;
        });
      }

      maybeIncrementProjectStateVersion(true);
    }
  },
  50,
);
