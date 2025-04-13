import C from "constants/constants.json";
import _ from "lodash";
import { useEffect, useRef, useState } from "react";
import { debouncedTypeCheckRequest, getEVRefs } from "requests/sections";
import { setParamEnteredValue } from "state/actions/sectionInfos";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos } from "state/definitions";
import { useSendToInteractiveTasks } from "state/hooks/interactive";
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
  const sendToInteractiveTasksFn = useSendToInteractiveTasks([
    sectionId,
    paramInfoId,
  ]);
  const abortController = useRef();

  // value and enteredValue should always be string
  function onChange(v) {
    const vStr = _.toString(v);
    setValue(vStr);
    abortController.current?.abort();
    debouncedSetParamEnteredValue(
      sectionId,
      paramInfoId,
      vStr,
      abortController,
    );
    debouncedTypeCheckRequest();
    sendToInteractiveTasksFn(vStr);
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

const debouncedSetParamEnteredValue = asyncDebounce(
  async (sectionId, paramInfoId, vStr, abortControllerRef) => {
    const ac = new AbortController();
    abortControllerRef.current = ac;
    await cancelableSetParamEnteredValue({ sectionId, paramInfoId, vStr, ac });
  },
  50,
);

async function cancelableSetParamEnteredValue({
  sectionId,
  paramInfoId,
  vStr,
  ac,
}) {
  if (getParamUIType(sectionId, paramInfoId).type === C.TEXT) {
    if (ac?.signal.aborted) return;
    const evRefs = await getEVRefs({
      sectionId,
      paramInfoId,
      fullText: vStr,
    });
    if (ac?.signal.aborted) return;
    useSectionInfos.setState((state) => {
      setParamEnteredValue(sectionId, paramInfoId, vStr, state);
      const { variantId } = state.x[sectionId];
      state.variants[variantId].values[paramInfoId].evRefs = evRefs;
    });
  } else {
    if (ac?.signal.aborted) return;
    useSectionInfos.setState((state) => {
      setParamEnteredValue(sectionId, paramInfoId, vStr, state);
    });
  }

  maybeIncrementProjectStateVersion(true);
}

/**
 * Set the values of multiple parameters.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId
 * @param {Object<ID, string>} paramIdsToValues A mapping from param id to value. Each value is a string that contains python code that evaluates to whatever you want the parameter's value to be. For example to set the parameter to True, pass in "True". To set the parameter to "dog", pass in '"dog"'.
 */
export async function setParamValuesMcp({ sectionId, paramIdsToValues }) {
  for (const [paramInfoId, vStr] of Object.entries(paramIdsToValues)) {
    await cancelableSetParamEnteredValue({ sectionId, paramInfoId, vStr });
  }
}
