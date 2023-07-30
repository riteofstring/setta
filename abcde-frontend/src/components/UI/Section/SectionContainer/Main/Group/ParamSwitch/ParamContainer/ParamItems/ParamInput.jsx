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
    setValue(_.toString(v));
  };

  // value and enteredValue should always be string
  const onBlur = (v, changedByUser = true) => {
    const vStr = _.toString(v);
    if (vStr !== enteredValue) {
      onChange(vStr);
      setParamEnteredValue({
        sectionId,
        paramInfoId,
        value: vStr,
        incrementVersion: changedByUser,
      });
    }
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
        onBlur,
        isDisabled,
        className: "nodrag",
        ...uiType.config,
      }}
    />
  );
}
