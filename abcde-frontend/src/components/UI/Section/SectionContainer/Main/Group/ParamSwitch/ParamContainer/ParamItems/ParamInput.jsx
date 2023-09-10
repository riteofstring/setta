import { useGetParamEnteredValue } from "hooks/useEnteredValue";
import _ from "lodash";
import { useEffect, useState } from "react";
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
  const onChange = (v) => {
    const vStr = _.toString(v);
    setValue(vStr);
    setEnteredValue(sectionId, paramInfoId, enteredValue, vStr);
  };

  useEffect(() => {
    if (value !== enteredValue) {
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

const setEnteredValue = _.debounce(
  (sectionId, paramInfoId, enteredValue, vStr, changedByUser = true) => {
    if (vStr !== enteredValue) {
      setParamEnteredValue({
        sectionId,
        paramInfoId,
        value: vStr,
        incrementVersion: changedByUser,
      });
    }
  },
  500
);
