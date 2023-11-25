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

  function onChange(newValue) {
    setValue(newValue);
    setEnteredValue(newValue);
  }

  const setEnteredValue = useCallback(
    _.debounce((newValue, changedByUser = true) => {
      if (!_.isEqual(newValue, enteredValue)) {
        setParamEnteredValue({
          sectionId,
          paramInfoId,
          value: newValue,
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
        paramInfoId,
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
