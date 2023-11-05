import { useGetParamEnteredValue } from "hooks/useEnteredValue";
import _ from "lodash";
import { useCallback, useEffect, useState } from "react";
import { setParamEnteredValue } from "thunks/paramInfos";
import { ParamUI } from "../ParamUIs/ParamUI";

export function ParamInput({
  sectionId,
  paramInfoId,
  defaultVal,
  uiType,
  isDisabled,
}) {
  const enteredValue = useGetParamEnteredValue(sectionId, paramInfoId);
  const [value, setValue] = useState(enteredValue);

  // value and enteredValue should always be string
  function onChange(idx, type, v) {
    const vStr = _.toString(v);
    setValue(value.map((x, i) => (i === idx ? { type, value: vStr } : x)));
    setEnteredValue(idx, type, vStr);
  }

  const setEnteredValue = useCallback(
    _.debounce((idx, type, vStr, changedByUser = true) => {
      if (!_.isEqual({ type, value: vStr }, enteredValue[idx])) {
        setParamEnteredValue({
          sectionId,
          paramInfoId,
          idx,
          value: vStr,
          incrementVersion: changedByUser,
        });
      }
    }, 500),
    [enteredValue]
  );

  useEffect(() => {
    if (!_.isEqual(value, enteredValue)) {
      setValue(enteredValue);
    }
  }, [enteredValue]);

  return (
    <ParamUI
      name={uiType.type}
      childProps={{
        sectionId,
        value,
        defaultVal,
        onChange,
        isDisabled,
        className: "nodrag",
        ...uiType.config,
      }}
    />
  );
}
