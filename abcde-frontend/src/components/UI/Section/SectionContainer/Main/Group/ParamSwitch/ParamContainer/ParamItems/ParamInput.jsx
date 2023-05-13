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
  const [value, setValue] = useState("");

  const onChange = (v) => {
    setValue(v);
  };

  const onBlur = (v, changedByUser = true) => {
    onChange(v);
    setParamEnteredValue({
      sectionId,
      paramInfoId,
      value: v,
      incrementVersion: changedByUser,
    });
  };

  useEffect(() => {
    setValue(!_.isNil(enteredValue) ? enteredValue : "");
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
