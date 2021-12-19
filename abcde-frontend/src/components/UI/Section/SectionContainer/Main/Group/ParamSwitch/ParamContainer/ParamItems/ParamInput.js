import { useState, useEffect } from "react";

import { nullOrUndefined } from "../../../../../../../../../utils/utils";
import ParamUI from "../ParamUIs/ParamUI";

export default function ParamInput(props) {
  const { paramInfo, uiType, enteredValueFn } = props;
  const { defaultVal } = paramInfo;

  const [enteredValue, setEnteredValue] = enteredValueFn(paramInfo);
  const [value, setValue] = useState("");

  const onChange = (v) => {
    setValue(v);
  };

  const onChangeEnd = (v) => {
    onChange(v);
    setEnteredValue(v);
  };

  useEffect(() => {
    setValue(!nullOrUndefined(enteredValue) ? enteredValue : "");
  }, [enteredValue]);

  return (
    <ParamUI
      name={uiType.name}
      childProps={{
        value,
        defaultVal,
        onChange,
        onChangeEnd,
        isDisabled: props.isDisabled,
        ...props.uiTypeConfig,
      }}
    />
  );
}
