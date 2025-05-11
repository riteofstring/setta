import _ from "lodash";
import { useEffect, useState } from "react";
import { setParamEnteredValue } from "state/actions/sectionInfos";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { useSectionInfos } from "state/definitions";
import { useGetParamEnteredValueAndEVRefs } from "state/hooks/sectionVariants";
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
    debouncedSetParamEnteredValue(sectionId, paramInfoId, vStr);
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

const debouncedSetParamEnteredValue = _.debounce(
  (sectionId, paramInfoId, vStr) => {
    useSectionInfos.setState((state) => {
      setParamEnteredValue(sectionId, paramInfoId, vStr, state);
    });
    maybeIncrementProjectStateVersion(true);
  },
  50,
);

/**
 * Set the values of multiple parameters in a particular section.
 * @SETTA_MCP_TOOL
 * @param {ID} sectionId The id of the section that contains the parameters.
 * @param {Object<ID, string>} paramIdsToValues A mapping from parameter id to value. Each value is a string that contains python code that evaluates to whatever you want the parameter's value to be. For example to set the parameter to True, pass in "True". To set the parameter to "dog", pass in '"dog"'.
 */
export function setParamValuesMcp({ sectionId, paramIdsToValues }) {
  useSectionInfos.setState((state) => {
    for (const [paramInfoId, vStr] of Object.entries(paramIdsToValues)) {
      setParamEnteredValue(sectionId, paramInfoId, vStr, state);
    }
  });
}
